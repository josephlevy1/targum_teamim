import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { isVerseIdInRange } from "@targum/core";
import { getDataPaths } from "../lib/config";
import { getRepository } from "../lib/repository";
import {
  backfillWitnessFromRemapRange,
  getSystemTelemetry,
  recomputeTaamConsensusForVerse,
  remapWitnessRegionsBySnippet,
  runTaamAlignmentForVerse,
} from "../lib/manuscripts-pipeline";

type StageName = "stage_a_calibration" | "stage_b_ocr_health" | "stage_c_remap_backfill" | "stage_d_taam_align" | "stage_e_taam_consensus" | "stage_f_finalize";

type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

type WitnessMetrics = {
  witnessId: string;
  sourcePriority: number;
  pages: number;
  regions: number;
  ocrArtifacts: number;
  ocrMeanConfidence: number;
  ocrCoverageEstimate: number;
  splitRows: number;
  splitPartialRows: number;
  remapAmbiguousRegions: number;
  ocrFailureRate: number;
  splitPartialRate: number;
  remapAmbiguousRate: number;
  blocked: boolean;
  blockReasons: string[];
  touchedVerses: string[];
};

type StageCheckpoint = {
  name: StageName;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  details?: Record<string, unknown>;
  error?: string;
};

type OvernightCheckpoint = {
  runId: string;
  host: string;
  startedAt: string;
  updatedAt: string;
  status: "running" | "completed" | "failed";
  preflight: Record<string, unknown>;
  stages: Record<StageName, StageCheckpoint>;
  witnesses: Record<string, WitnessMetrics>;
  touchedVerseUnion: string[];
  monitoringSnapshots: Array<{ at: string; files: string[] }>;
};

type Args = {
  resume: boolean;
  runId?: string;
  preflightOnly: boolean;
  dryRun: boolean;
  pollMinutes: number;
  monitorBaseUrl: string;
  witnesses?: string[];
  chunkSize: number;
  minScore: number;
  minMargin: number;
  maxWindow: number;
  stageDConcurrency: number;
  stageEConcurrency: number;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => argv.find((arg) => arg.startsWith(`${name}=`))?.split("=").slice(1).join("=");
  const witnessesRaw = get("--witnesses");
  const witnesses = witnessesRaw
    ? witnessesRaw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  return {
    resume: argv.includes("--resume"),
    runId: get("--run-id"),
    preflightOnly: argv.includes("--preflight-only"),
    dryRun: argv.includes("--dry-run"),
    pollMinutes: Math.max(5, Number(get("--poll-minutes") ?? 5)),
    monitorBaseUrl: get("--monitor-base-url") ?? "http://127.0.0.1:3000",
    witnesses,
    chunkSize: Math.max(10, Number(get("--chunk-size") ?? 50)),
    minScore: Number(get("--min-score") ?? 0.78),
    minMargin: Number(get("--min-margin") ?? 0.08),
    maxWindow: Math.max(1, Number(get("--max-window") ?? 5)),
    stageDConcurrency: Math.max(1, Math.min(2, Number(get("--taam-align-concurrency") ?? 2))),
    stageEConcurrency: Math.max(1, Math.min(2, Number(get("--taam-consensus-concurrency") ?? 2))),
  };
}

function tsForId(iso = new Date().toISOString()): string {
  return iso.replace(/[:.]/g, "-");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function commandOk(cmd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const run = spawnSync(cmd, args, { encoding: "utf8" });
  return {
    ok: !run.error && run.status === 0,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? run.error?.message ?? "",
  };
}

async function fetchJson(url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = (await response.json().catch(() => ({ parseError: true }))) as unknown;
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: { error: error instanceof Error ? error.message : String(error) } };
  } finally {
    clearTimeout(timeout);
  }
}

function buildInitialCheckpoint(runId: string): OvernightCheckpoint {
  const stages: Record<StageName, StageCheckpoint> = {
    stage_a_calibration: { name: "stage_a_calibration", status: "pending" },
    stage_b_ocr_health: { name: "stage_b_ocr_health", status: "pending" },
    stage_c_remap_backfill: { name: "stage_c_remap_backfill", status: "pending" },
    stage_d_taam_align: { name: "stage_d_taam_align", status: "pending" },
    stage_e_taam_consensus: { name: "stage_e_taam_consensus", status: "pending" },
    stage_f_finalize: { name: "stage_f_finalize", status: "pending" },
  };
  return {
    runId,
    host: process.env.HOSTNAME ?? "local-host",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "running",
    preflight: {},
    stages,
    witnesses: {},
    touchedVerseUnion: [],
    monitoringSnapshots: [],
  };
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < concurrency; i += 1) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) return;
          await fn(item);
        }
      })(),
    );
  }
  await Promise.all(workers);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { dataDir, dbPath } = getDataPaths();
  const overnightRoot = path.join(dataDir, "imports", "manuscripts", "overnight");
  ensureDir(overnightRoot);

  let runId = args.runId;
  if (!runId && args.resume) {
    const dirs = fs.readdirSync(overnightRoot).sort();
    runId = dirs[dirs.length - 1];
  }
  if (!runId) runId = tsForId();

  const runDir = path.join(overnightRoot, runId);
  ensureDir(runDir);
  const monitoringDir = path.join(runDir, "monitoring");
  ensureDir(monitoringDir);
  const logsDir = path.join(runDir, "logs");
  ensureDir(logsDir);

  const checkpointPath = path.join(runDir, "checkpoint.json");
  const preflightPath = path.join(runDir, "preflight.json");
  const logPath = path.join(logsDir, "overnight.log");

  const appendLog = (event: string, payload: Record<string, unknown>) => {
    const line = JSON.stringify({ at: new Date().toISOString(), event, ...payload });
    fs.appendFileSync(logPath, `${line}\n`, "utf8");
    console.log(line);
  };

  const checkpoint = args.resume && fs.existsSync(checkpointPath) ? readJson<OvernightCheckpoint>(checkpointPath) : buildInitialCheckpoint(runId);

  const persistCheckpoint = () => {
    checkpoint.updatedAt = new Date().toISOString();
    writeJson(checkpointPath, checkpoint);
  };

  const stageStart = (name: StageName, details?: Record<string, unknown>) => {
    checkpoint.stages[name] = {
      name,
      status: "running",
      startedAt: new Date().toISOString(),
      details,
    };
    persistCheckpoint();
  };

  const stageDone = (name: StageName, details?: Record<string, unknown>) => {
    checkpoint.stages[name] = {
      ...checkpoint.stages[name],
      name,
      status: "completed",
      finishedAt: new Date().toISOString(),
      details: { ...(checkpoint.stages[name].details ?? {}), ...(details ?? {}) },
    };
    persistCheckpoint();
  };

  const stageSkip = (name: StageName, reason: string) => {
    checkpoint.stages[name] = {
      ...checkpoint.stages[name],
      name,
      status: "skipped",
      finishedAt: new Date().toISOString(),
      details: { ...(checkpoint.stages[name].details ?? {}), reason },
    };
    persistCheckpoint();
  };

  const stageFail = (name: StageName, error: string) => {
    checkpoint.stages[name] = {
      ...checkpoint.stages[name],
      name,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error,
    };
    checkpoint.status = "failed";
    persistCheckpoint();
  };

  const pollMonitoring = async (tag: string) => {
    const stamp = tsForId();
    const files: string[] = [];
    const endpoints = ["summary", "jobs", "system"] as const;
    for (const endpoint of endpoints) {
      const json = await fetchJson(`${args.monitorBaseUrl}/api/manuscripts/monitoring/${endpoint}`);
      const file = path.join(monitoringDir, `${stamp}-${tag}-${endpoint}.json`);
      writeJson(file, json);
      files.push(file);
    }
    checkpoint.monitoringSnapshots.push({ at: new Date().toISOString(), files });
    persistCheckpoint();
  };

  appendLog("run_start", { runId, resume: args.resume, dryRun: args.dryRun, preflightOnly: args.preflightOnly, monitorBaseUrl: args.monitorBaseUrl });

  const repo = getRepository();
  const preflightChecks: Array<{ check: string; ok: boolean; detail: string }> = [];

  try {
    const dbExists = fs.existsSync(dbPath);
    preflightChecks.push({ check: "db_exists", ok: dbExists, detail: dbPath });
    if (dbExists) {
      try {
        fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
        preflightChecks.push({ check: "db_rw", ok: true, detail: "read/write ok" });
      } catch {
        preflightChecks.push({ check: "db_rw", ok: false, detail: "read/write access failed" });
      }
    }

    const tesseract = commandOk("tesseract", ["--version"]);
    preflightChecks.push({ check: "tesseract", ok: tesseract.ok, detail: tesseract.ok ? "ok" : tesseract.stderr });
    const tesseractLangs = commandOk("tesseract", ["--list-langs"]);
    preflightChecks.push({
      check: "tesseract_heb",
      ok: tesseractLangs.ok && /\bheb\b/.test(tesseractLangs.stdout),
      detail: tesseractLangs.ok ? "heb present" : tesseractLangs.stderr,
    });

    const pdftoppm = commandOk("pdftoppm", ["-h"]);
    preflightChecks.push({ check: "pdftoppm", ok: pdftoppm.ok || /pdftoppm/.test(pdftoppm.stderr), detail: pdftoppm.ok ? "ok" : pdftoppm.stderr });
    const sips = commandOk("sips", ["--help"]);
    preflightChecks.push({ check: "sips", ok: sips.ok, detail: sips.ok ? "ok" : sips.stderr });

    const priorityWitnesses = repo
      .listWitnesses()
      .filter((witness) => Number.isInteger(witness.sourcePriority) && (witness.sourcePriority ?? 0) >= 1 && (witness.sourcePriority ?? 0) <= 12)
      .sort((a, b) => (a.sourcePriority ?? 99) - (b.sourcePriority ?? 99));
    const priorities = new Set(priorityWitnesses.map((w) => w.sourcePriority));
    const missing: number[] = [];
    for (let i = 1; i <= 12; i += 1) {
      if (!priorities.has(i)) missing.push(i);
    }
    preflightChecks.push({ check: "witness_p1_p12", ok: missing.length === 0, detail: missing.length === 0 ? "all present" : `missing: ${missing.join(",")}` });

    const runtimeProfilePath = path.join(path.resolve(process.cwd(), "../.."), "docs", "m1-8gb-runtime-profile.md");
    preflightChecks.push({ check: "runtime_profile_doc", ok: fs.existsSync(runtimeProfilePath), detail: runtimeProfilePath });
    const telemetry = getSystemTelemetry();
    preflightChecks.push({
      check: "runtime_profile_limits",
      ok: telemetry.limits.ocrWorkers <= 2 && telemetry.limits.splitRemapWorkers <= 2 && telemetry.limits.taamAlignWorkers <= 2,
      detail: JSON.stringify(telemetry.limits),
    });

    const summary = await fetchJson(`${args.monitorBaseUrl}/api/manuscripts/monitoring/summary`);
    const jobs = await fetchJson(`${args.monitorBaseUrl}/api/manuscripts/monitoring/jobs`);
    const system = await fetchJson(`${args.monitorBaseUrl}/api/manuscripts/monitoring/system`);
    preflightChecks.push({ check: "monitor_summary", ok: summary.ok, detail: `status=${summary.status}` });
    preflightChecks.push({ check: "monitor_jobs", ok: jobs.ok, detail: `status=${jobs.status}` });
    preflightChecks.push({ check: "monitor_system", ok: system.ok, detail: `status=${system.status}` });

    const preflightOk = preflightChecks.every((check) => check.ok);
    const preflight = {
      runId,
      at: new Date().toISOString(),
      status: preflightOk ? "CONFIRMED_READY" : "BLOCKED",
      checks: preflightChecks,
      args,
    };
    checkpoint.preflight = preflight;
    writeJson(preflightPath, preflight);
    persistCheckpoint();
    appendLog("preflight", { status: preflight.status });

    if (!preflightOk) {
      checkpoint.status = "failed";
      persistCheckpoint();
      throw new Error("Preflight blocked. See preflight.json");
    }
    if (args.preflightOnly) {
      checkpoint.status = "completed";
      persistCheckpoint();
      appendLog("preflight_only_exit", {});
      return;
    }

    const selectedWitnesses = repo
      .listWitnesses()
      .filter((witness) => Number.isInteger(witness.sourcePriority) && (witness.sourcePriority ?? 0) >= 1 && (witness.sourcePriority ?? 0) <= 12)
      .sort((a, b) => (a.sourcePriority ?? 99) - (b.sourcePriority ?? 99))
      .filter((witness) => (args.witnesses ? args.witnesses.includes(witness.id) : true));

    const allVerseIds = repo.listVerseIds();

    const shouldResumeSkip = (name: StageName) => args.resume && checkpoint.stages[name]?.status === "completed";

    const collectVerseIdsForWitness = (witnessId: string, pageStart?: number, pageEnd?: number): string[] => {
      const set = new Set<string>();
      const regions = repo.listRegionsByWitness(witnessId).filter((region) => {
        if (!region.startVerseId || !region.endVerseId) return false;
        if (region.remapReviewRequired) return false;
        if (pageStart === undefined && pageEnd === undefined) return true;
        const page = repo.getPage(region.pageId);
        if (!page) return false;
        if (pageStart !== undefined && page.pageIndex < pageStart) return false;
        if (pageEnd !== undefined && page.pageIndex > pageEnd) return false;
        return true;
      });

      for (const region of regions) {
        for (const verseId of allVerseIds) {
          if (isVerseIdInRange(verseId, region.startVerseId as any, region.endVerseId as any)) {
            set.add(verseId);
          }
        }
      }
      return Array.from(set).sort();
    };

    if (shouldResumeSkip("stage_a_calibration")) {
      stageSkip("stage_a_calibration", "resume completed");
    } else {
      stageStart("stage_a_calibration", { witnessCount: selectedWitnesses.length });
      const opsSnapshot = repo.getManuscriptOpsSnapshot();
      const byWitness = new Map(opsSnapshot.map((row) => [row.witnessId, row]));

      for (const witness of selectedWitnesses) {
        const pages = repo.listPagesByWitness(witness.id);
        const regions = repo.listRegionsByWitness(witness.id);
        let confSum = 0;
        let covSum = 0;
        let artifacts = 0;
        for (const region of regions) {
          const artifact = repo.getRegionOcrArtifact(region.id);
          if (!artifact) continue;
          artifacts += 1;
          confSum += artifact.ocrMeanConf;
          covSum += artifact.coverageRatioEst;
        }

        const snapshot = byWitness.get(witness.id);
        const splitRows = snapshot?.splitRows ?? 0;
        const splitPartialRows = snapshot?.splitPartialRows ?? 0;
        const remapAmbiguousRegions = regions.filter((region) => region.remapReviewRequired).length;

        const regionIds = new Set(regions.map((region) => region.id));
        const jobs = repo.listOcrJobs().filter((job) => regionIds.has(job.regionId));
        const failed = jobs.filter((job) => job.status === "failed").length;
        const completed = jobs.filter((job) => job.status === "completed").length;
        const ocrFailureRate = failed + completed > 0 ? failed / (failed + completed) : 0;
        const splitPartialRate = splitRows > 0 ? splitPartialRows / splitRows : 0;
        const remapAmbiguousRate = regions.length > 0 ? remapAmbiguousRegions / regions.length : 0;

        const blockReasons: string[] = [];
        if (ocrFailureRate > 0.15) blockReasons.push(`OCR failure rate ${(ocrFailureRate * 100).toFixed(1)}% > 15%`);
        if (splitPartialRate > 0.3) blockReasons.push(`split partial rate ${(splitPartialRate * 100).toFixed(1)}% > 30%`);
        if (remapAmbiguousRate > 0.25) blockReasons.push(`remap ambiguous rate ${(remapAmbiguousRate * 100).toFixed(1)}% > 25%`);

        checkpoint.witnesses[witness.id] = {
          witnessId: witness.id,
          sourcePriority: witness.sourcePriority ?? 0,
          pages: pages.length,
          regions: regions.length,
          ocrArtifacts: artifacts,
          ocrMeanConfidence: artifacts > 0 ? confSum / artifacts : 0,
          ocrCoverageEstimate: artifacts > 0 ? covSum / artifacts : 0,
          splitRows,
          splitPartialRows,
          remapAmbiguousRegions,
          ocrFailureRate,
          splitPartialRate,
          remapAmbiguousRate,
          blocked: blockReasons.length > 0,
          blockReasons,
          touchedVerses: [],
        };
      }
      persistCheckpoint();
      await pollMonitoring("stage-a");
      stageDone("stage_a_calibration", { blockedWitnesses: Object.values(checkpoint.witnesses).filter((witness) => witness.blocked).map((witness) => witness.witnessId) });
    }

    if (shouldResumeSkip("stage_b_ocr_health")) {
      stageSkip("stage_b_ocr_health", "resume completed");
    } else {
      stageStart("stage_b_ocr_health", {});
      if (args.dryRun) {
        stageDone("stage_b_ocr_health", { dryRun: true });
      } else {
        for (const witness of selectedWitnesses) {
          if (checkpoint.witnesses[witness.id]?.blocked) continue;
          const run = spawnSync(
            "pnpm",
            ["--filter", "web", "manuscripts:ocr-workers", "--", "--workers=2", "--stale-minutes=20", "--retry-failed=true", `--witness=${witness.id}`],
            { encoding: "utf8" },
          );
          appendLog("ocr_worker_run", {
            witnessId: witness.id,
            status: run.status,
            stdout: run.stdout?.split("\n").slice(-3).join("\n"),
            stderr: run.stderr?.split("\n").slice(-3).join("\n"),
          });
        }
        await pollMonitoring("stage-b");
        stageDone("stage_b_ocr_health", { mode: "workers=2" });
      }
    }

    if (shouldResumeSkip("stage_c_remap_backfill")) {
      stageSkip("stage_c_remap_backfill", "resume completed");
    } else {
      stageStart("stage_c_remap_backfill", {
        minScore: args.minScore,
        minMargin: args.minMargin,
        maxWindow: args.maxWindow,
        chunkSize: args.chunkSize,
      });

      for (const witness of selectedWitnesses) {
        const metric = checkpoint.witnesses[witness.id];
        if (!metric || metric.blocked) {
          appendLog("skip_witness_stage_c", { witnessId: witness.id, reason: metric?.blockReasons ?? ["missing metrics"] });
          continue;
        }

        const pages = repo.listPagesByWitness(witness.id).sort((a, b) => a.pageIndex - b.pageIndex);
        if (pages.length === 0) continue;

        const windows: Array<{ start: number; end: number }> = [];
        for (let i = 0; i < pages.length; i += args.chunkSize) {
          windows.push({ start: pages[i].pageIndex, end: pages[Math.min(pages.length - 1, i + args.chunkSize - 1)].pageIndex });
        }

        let witnessFailed = false;
        for (const window of windows) {
          let success = false;
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
              if (!args.dryRun) {
                const remap = await remapWitnessRegionsBySnippet({
                  witnessId: witness.id,
                  minScore: args.minScore,
                  minMargin: args.minMargin,
                  maxWindow: args.maxWindow,
                  pageIndexStart: window.start,
                  pageIndexEnd: window.end,
                });
                const backfill = await backfillWitnessFromRemapRange({
                  witnessId: witness.id,
                  pageIndexStart: window.start,
                  pageIndexEnd: window.end,
                });
                appendLog("stage_c_window", { witnessId: witness.id, window, attempt, remap, backfill });
              }
              const touched = collectVerseIdsForWitness(witness.id, window.start, window.end);
              for (const verseId of touched) {
                if (!metric.touchedVerses.includes(verseId)) metric.touchedVerses.push(verseId);
              }
              success = true;
              break;
            } catch (error) {
              appendLog("stage_c_window_error", {
                witnessId: witness.id,
                window,
                attempt,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
          if (!success) {
            witnessFailed = true;
            metric.blocked = true;
            metric.blockReasons.push(`remap/backfill failed for window ${window.start}-${window.end}`);
            break;
          }
        }

        if (!witnessFailed) {
          metric.touchedVerses = Array.from(new Set(metric.touchedVerses)).sort();
        }
        persistCheckpoint();
        await pollMonitoring(`stage-c-${witness.id}`);
      }

      checkpoint.touchedVerseUnion = Array.from(
        new Set(Object.values(checkpoint.witnesses).flatMap((witness) => witness.touchedVerses)),
      ).sort();
      persistCheckpoint();
      stageDone("stage_c_remap_backfill", { touchedVerseUnion: checkpoint.touchedVerseUnion.length });
    }

    if (shouldResumeSkip("stage_d_taam_align")) {
      stageSkip("stage_d_taam_align", "resume completed");
    } else {
      stageStart("stage_d_taam_align", { concurrency: args.stageDConcurrency });
      if (!args.dryRun) {
        const versePairs = Object.values(checkpoint.witnesses)
          .filter((witness) => !witness.blocked)
          .flatMap((witness) => witness.touchedVerses.map((verseId) => ({ verseId, witnessId: witness.witnessId })));

        await mapWithConcurrency(versePairs, args.stageDConcurrency, async (item) => {
          runTaamAlignmentForVerse(item.verseId, "working_text");
          appendLog("stage_d_aligned", item);
        });
      }
      await pollMonitoring("stage-d");
      stageDone("stage_d_taam_align", { alignedVerses: checkpoint.touchedVerseUnion.length });
    }

    if (shouldResumeSkip("stage_e_taam_consensus")) {
      stageSkip("stage_e_taam_consensus", "resume completed");
    } else {
      stageStart("stage_e_taam_consensus", { concurrency: args.stageEConcurrency });
      if (!args.dryRun) {
        await mapWithConcurrency(checkpoint.touchedVerseUnion, args.stageEConcurrency, async (verseId) => {
          const result = recomputeTaamConsensusForVerse(verseId, "working_text");
          appendLog("stage_e_consensus", { verseId, consensusCount: result.consensusCount, confidence: result.ensembleConfidence });
        });
      }
      await pollMonitoring("stage-e");
      stageDone("stage_e_taam_consensus", { consensusVerses: checkpoint.touchedVerseUnion.length });
    }

    if (shouldResumeSkip("stage_f_finalize")) {
      stageSkip("stage_f_finalize", "resume completed");
    } else {
      stageStart("stage_f_finalize", {});
      await pollMonitoring("stage-f");

      const initialMonitoring = checkpoint.monitoringSnapshots[0];
      const latestMonitoring = checkpoint.monitoringSnapshots[checkpoint.monitoringSnapshots.length - 1];
      const readQueue = (entry: { files: string[] } | undefined): Record<string, number> => {
        if (!entry) return {};
        const summaryFile = entry.files.find((file) => file.endsWith("-summary.json"));
        if (!summaryFile || !fs.existsSync(summaryFile)) return {};
        const content = readJson<{ body?: { queues?: Record<string, number> } }>(summaryFile);
        return content.body?.queues ?? {};
      };
      const queueStart = readQueue(initialMonitoring);
      const queueEnd = readQueue(latestMonitoring);
      const queueDelta: Record<string, number> = {};
      for (const key of new Set([...Object.keys(queueStart), ...Object.keys(queueEnd)])) {
        queueDelta[key] = (queueEnd[key] ?? 0) - (queueStart[key] ?? 0);
      }

      const summaryMdPath = path.join(runDir, "overnight-summary.md");
      const summary = `# Overnight Alignment Summary\n\n- Run ID: ${runId}\n- Started: ${checkpoint.startedAt}\n- Updated: ${new Date().toISOString()}\n- Dry run: ${args.dryRun ? "yes" : "no"}\n\n## Stage Status\n${Object.values(checkpoint.stages)
        .map((stage) => `- ${stage.name}: ${stage.status}`)
        .join("\n")}\n\n## Witness Outcomes\n${Object.values(checkpoint.witnesses)
        .sort((a, b) => a.sourcePriority - b.sourcePriority)
        .map(
          (w) =>
            `- ${w.witnessId} (P${w.sourcePriority}): blocked=${w.blocked ? "yes" : "no"}, touched_verses=${w.touchedVerses.length}, ocr_mean_conf=${w.ocrMeanConfidence.toFixed(3)}, split_partial_rate=${(w.splitPartialRate * 100).toFixed(1)}%, remap_ambiguous_rate=${(w.remapAmbiguousRate * 100).toFixed(1)}%${w.blockReasons.length ? `, reasons=${w.blockReasons.join("; ")}` : ""}`,
        )
        .join("\n")}\n\n## Queue Delta\n${Object.entries(queueDelta)
        .map(([k, v]) => `- ${k}: ${v >= 0 ? "+" : ""}${v}`)
        .join("\n")}\n\n## Artifacts\n- Preflight: ${preflightPath}\n- Checkpoint: ${checkpointPath}\n- Monitoring snapshots: ${monitoringDir}\n- Logs: ${logPath}\n`;
      fs.writeFileSync(summaryMdPath, summary, "utf8");

      const docsRunPath = path.join(path.resolve(process.cwd(), "../.."), "docs", "import-runs", `${runId}-overnight-calibration.md`);
      const calibrationMd = `# Overnight Calibration + Alignment Report\n\n- Run ID: ${runId}\n- Generated: ${new Date().toISOString()}\n\n## Witness Metrics\n${Object.values(checkpoint.witnesses)
        .sort((a, b) => a.sourcePriority - b.sourcePriority)
        .map(
          (w) =>
            `- ${w.witnessId}: ocr_mean_conf=${w.ocrMeanConfidence.toFixed(3)}, ocr_coverage=${w.ocrCoverageEstimate.toFixed(3)}, split_partial_rate=${(w.splitPartialRate * 100).toFixed(1)}%, remap_ambiguous_rate=${(w.remapAmbiguousRate * 100).toFixed(1)}%, blocked=${w.blocked ? "yes" : "no"}`,
        )
        .join("\n")}\n\n## Threshold Notes\n- OCR failure stop threshold: 15%\n- Split partial stop threshold: 30%\n- Remap ambiguous review threshold: 25%\n`;
      fs.writeFileSync(docsRunPath, calibrationMd, "utf8");

      stageDone("stage_f_finalize", { summaryMdPath, docsRunPath });
    }

    checkpoint.status = "completed";
    persistCheckpoint();
    appendLog("run_complete", { runId, status: checkpoint.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLog("run_error", { error: message });
    checkpoint.status = "failed";
    persistCheckpoint();
    process.exitCode = 1;
  }
}

main();
