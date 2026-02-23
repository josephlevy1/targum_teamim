import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { evaluateSourceGate, markStageCompleted, markStageFailed } from "./manuscripts-gating";
import { getRepository } from "./repository";
import { analyzePageForImport } from "./manuscripts-images";
import {
  getProjectRoot,
  materializeHebrewbooksPages,
  stageWindowPages,
  witnessRawPagesDir,
  witnessRunsDir,
} from "./manuscripts-import";
import { recomputeCascadeForVerse, recomputeSourceConfidence, runRegionOcr, splitRegionIntoWitnessVerses } from "./manuscripts-pipeline";

export interface ManuscriptImportArgs {
  witnessId: string;
  mode: "calibration" | "batch";
  startPage: number;
  pageCount: number;
  adminOverride: boolean;
  actor: string;
}

export interface StageTiming {
  startedAt: string;
  endedAt?: string;
  status: "running" | "completed" | "failed" | "blocked";
  note?: string;
}

export interface ManuscriptImportSummary {
  witnessId: string;
  mode: "calibration" | "batch";
  startPage: number;
  pageCount: number;
  adminOverride: boolean;
  actor: string;
  engine: "tesseract";
  pagesImported: number;
  regionsAnnotated: number;
  regionsOcrCompleted: number;
  regionsOcrFailed: number;
  splitSuccess: number;
  splitPartial: number;
  meanOcrConfidence: number;
  blockers: Array<{ stage: string; reasonCode: string; detail: string }>;
  stageTimings: Record<string, StageTiming>;
  runStartedAt: string;
  runFinishedAt: string;
  reportJsonPath: string;
  reportMarkdownPath: string;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function toBool(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

export function parseImportArgs(argv: string[]): ManuscriptImportArgs {
  const get = (name: string): string | undefined => argv.find((arg) => arg.startsWith(`${name}=`))?.split("=").slice(1).join("=");

  const witnessId = get("--witness");
  if (!witnessId) {
    throw new Error("--witness=<id> is required");
  }

  const mode = (get("--mode") ?? "calibration") as "calibration" | "batch";
  if (mode !== "calibration" && mode !== "batch") {
    throw new Error("--mode must be calibration or batch");
  }

  const startPage = Math.max(1, Number(get("--start-page") ?? 1));
  const pageCountDefault = mode === "calibration" ? 20 : 50;
  const pageCount = Math.max(1, Number(get("--page-count") ?? pageCountDefault));

  return {
    witnessId,
    mode,
    startPage,
    pageCount,
    adminOverride: toBool(get("--admin-override"), false),
    actor: get("--actor") ?? process.env.USER ?? "import-runner",
  };
}

export function ensureTesseractRuntime(spawn: typeof spawnSync = spawnSync): void {
  const version = spawn("tesseract", ["--version"], { encoding: "utf8" });
  if (version.error || version.status !== 0) {
    throw new Error("tesseract is required for production manuscript imports.");
  }

  const langs = spawn("tesseract", ["--list-langs"], { encoding: "utf8" });
  if (langs.error || langs.status !== 0) {
    throw new Error("Unable to verify tesseract languages (expected 'heb').");
  }

  const output = `${langs.stdout}\n${langs.stderr}`.toLowerCase();
  if (!output.split(/\r?\n/).map((s) => s.trim()).includes("heb")) {
    throw new Error("tesseract language 'heb' is required for production manuscript imports.");
  }

  process.env.MANUSCRIPT_OCR_ENGINE = "tesseract";
  process.env.MANUSCRIPT_OCR_COMMAND = "tesseract";
  process.env.MANUSCRIPT_OCR_LANG = "heb";
  process.env.MANUSCRIPT_OCR_COMMAND_ARGS = "";
}

export function shouldStopBatch(input: {
  mode: "calibration" | "batch";
  ocrCompleted: number;
  ocrFailed: number;
  splitSuccess: number;
  splitPartial: number;
}): { stop: boolean; reasons: string[] } {
  if (input.mode !== "batch") return { stop: false, reasons: [] };

  const reasons: string[] = [];
  const ocrTotal = input.ocrCompleted + input.ocrFailed;
  const splitTotal = input.splitSuccess + input.splitPartial;

  const ocrFailureRate = ocrTotal > 0 ? input.ocrFailed / ocrTotal : 0;
  const splitPartialRate = splitTotal > 0 ? input.splitPartial / splitTotal : 0;

  if (ocrFailureRate > 0.15) reasons.push(`OCR failure rate ${(ocrFailureRate * 100).toFixed(1)}% exceeded 15% threshold`);
  if (splitPartialRate > 0.3) reasons.push(`Split partial rate ${(splitPartialRate * 100).toFixed(1)}% exceeded 30% threshold`);

  return {
    stop: reasons.length > 0,
    reasons,
  };
}

async function ensureSourcePages(args: ManuscriptImportArgs): Promise<{ rawPagesDir: string; isMaterializedWindow: boolean }> {
  const repo = getRepository();
  const witness = repo.getWitness(args.witnessId);
  if (!witness) {
    throw new Error(`Witness not found: ${args.witnessId}. Run manuscripts:bootstrap first.`);
  }

  if ((witness.sourcePriority ?? 99) >= 3 && witness.sourceFileName) {
    const materialized = materializeHebrewbooksPages({
      witness,
      startPage: args.startPage,
      pageCount: args.pageCount,
    });
    return {
      rawPagesDir: materialized.rawPagesDir,
      isMaterializedWindow: true,
    };
  }

  const rawPagesDir = witnessRawPagesDir(args.witnessId);
  if (!fs.existsSync(rawPagesDir)) {
    throw new Error(`Raw pages directory not found for ${args.witnessId}: ${rawPagesDir}`);
  }

  return { rawPagesDir, isMaterializedWindow: false };
}

function writeRunReport(summary: Omit<ManuscriptImportSummary, "reportJsonPath" | "reportMarkdownPath">): {
  jsonPath: string;
  markdownPath: string;
} {
  const root = getProjectRoot();
  const runsDir = witnessRunsDir(summary.witnessId);
  const docsDir = path.join(root, "docs", "import-runs");
  ensureDir(runsDir);
  ensureDir(docsDir);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(runsDir, `${ts}.json`);
  const markdownPath = path.join(docsDir, `${ts}-${summary.witnessId}.md`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const md = `# Manuscript Import Run\n\n- Witness: ${summary.witnessId}\n- Mode: ${summary.mode}\n- Start page: ${summary.startPage}\n- Page count: ${summary.pageCount}\n- Actor: ${summary.actor}\n- OCR engine: ${summary.engine}\n- Started: ${summary.runStartedAt}\n- Finished: ${summary.runFinishedAt}\n\n## Metrics\n- pages_imported: ${summary.pagesImported}\n- regions_annotated: ${summary.regionsAnnotated}\n- regions_ocr_completed: ${summary.regionsOcrCompleted}\n- regions_ocr_failed: ${summary.regionsOcrFailed}\n- split_success: ${summary.splitSuccess}\n- split_partial: ${summary.splitPartial}\n- mean_ocr_confidence: ${summary.meanOcrConfidence.toFixed(3)}\n\n## Blockers\n${summary.blockers.length > 0 ? summary.blockers.map((b) => `- ${b.stage}: ${b.reasonCode} (${b.detail})`).join("\n") : "- none"}\n`;
  fs.writeFileSync(markdownPath, md, "utf8");

  return { jsonPath, markdownPath };
}

function stageStart(stageTimings: Record<string, StageTiming>, stage: string): void {
  stageTimings[stage] = {
    startedAt: new Date().toISOString(),
    status: "running",
  };
}

function stageEnd(stageTimings: Record<string, StageTiming>, stage: string, status: StageTiming["status"], note?: string): void {
  const current = stageTimings[stage] ?? { startedAt: new Date().toISOString(), status: "running" as const };
  stageTimings[stage] = {
    ...current,
    endedAt: new Date().toISOString(),
    status,
    note,
  };
}

function logProgress(event: string, payload: Record<string, unknown>): void {
  console.log(
    JSON.stringify(
      {
        event,
        ...payload,
      },
      null,
      2,
    ),
  );
}

export async function runManuscriptImport(args: ManuscriptImportArgs): Promise<ManuscriptImportSummary> {
  ensureTesseractRuntime();
  const repo = getRepository();

  const runStartedAt = new Date().toISOString();
  const stageTimings: Record<string, StageTiming> = {};
  const blockers: Array<{ stage: string; reasonCode: string; detail: string }> = [];

  const source = await ensureSourcePages(args);
  const root = getProjectRoot();

  const ingestGate = evaluateSourceGate(
    {
      witnessId: args.witnessId,
      stage: "ingest",
      adminOverride: args.adminOverride,
      actor: args.actor,
      note: "import-run ingest stage",
    },
    repo,
  );
  if (!ingestGate.allowed) {
    throw new Error(`Ingest blocked by priority gate: ${ingestGate.blockers.map((b) => b.reasonCode).join(", ")}`);
  }

  stageStart(stageTimings, "ingest");
  let importedPages = 0;
  let windowedPages: ReturnType<typeof repo.listPagesByWitness> = [];
  try {
    const workDir = path.join(witnessRunsDir(args.witnessId), "_window");
    let imported: ReturnType<typeof repo.importPagesFromDirectory>;
    let stagedStartIndex = args.startPage;
    let stagedCount = 0;

    if (source.isMaterializedWindow) {
      imported = repo.importPagesFromDirectory({
        witnessId: args.witnessId,
        directoryPath: source.rawPagesDir,
        startIndex: args.startPage,
      });
      stagedCount = Math.max(1, args.pageCount);
    } else {
      const staged = stageWindowPages({
        sourceDir: source.rawPagesDir,
        outputDir: workDir,
        startPage: args.startPage,
        pageCount: args.pageCount,
      });
      stagedStartIndex = staged.startIndex;
      stagedCount = staged.stagedFiles.length;
      imported = repo.importPagesFromDirectory({
        witnessId: args.witnessId,
        directoryPath: workDir,
        startIndex: staged.startIndex,
      });
    }

    windowedPages = imported.pages.filter(
      (page) => page.pageIndex >= stagedStartIndex && page.pageIndex < stagedStartIndex + stagedCount,
    );

    const thumbsDir = path.join(root, "data", "imports", "manuscripts", args.witnessId, "thumbnails");
    for (const page of windowedPages) {
      const analyzed = await analyzePageForImport(page.imagePath, thumbsDir, page.pageIndex);
      repo.updatePageArtifacts({
        pageId: page.id,
        thumbnailPath: analyzed.thumbnailPath,
        quality: analyzed.quality,
        status: analyzed.status,
      });

      const regions = repo.listRegionsByPage(page.id);
      if (regions.length === 0) {
        const width = Number(analyzed.quality.width ?? 0) || 1000;
        const height = Number(analyzed.quality.height ?? 0) || 1500;
        repo.upsertPageRegion({
          pageId: page.id,
          regionIndex: 1,
          bbox: { x: 0, y: 0, w: Math.max(1, width), h: Math.max(1, height) },
          status: args.mode === "calibration" ? "ok" : "partial",
          startVerseId: args.mode === "calibration" ? "Genesis:1:1" : null,
          endVerseId: args.mode === "calibration" ? "Genesis:1:1" : null,
          notes:
            args.mode === "calibration"
              ? "Auto calibration region with temporary verse range."
              : "Auto-proposed full-page region. Requires review + verse range tagging before OCR.",
        });
      } else if (args.mode === "calibration") {
        const tagged = regions.some((region) => Boolean(region.startVerseId) && Boolean(region.endVerseId));
        if (!tagged) {
          const region = regions[0];
          repo.upsertPageRegion({
            id: region.id,
            pageId: region.pageId,
            regionIndex: region.regionIndex,
            bbox: region.bbox,
            startVerseId: "Genesis:1:1",
            endVerseId: "Genesis:1:1",
            status: "ok",
            notes: `${region.notes} | Calibration auto-tag applied.`,
          });
        }
      }
    }

    importedPages = windowedPages.length;
    markStageCompleted(args.witnessId, "ingest", args.actor, "engine=tesseract");
    stageEnd(stageTimings, "ingest", "completed");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    markStageFailed(args.witnessId, "ingest", msg, args.actor);
    stageEnd(stageTimings, "ingest", "failed", msg);
    throw error;
  }

  const ocrGate = evaluateSourceGate(
    {
      witnessId: args.witnessId,
      stage: "ocr",
      adminOverride: args.adminOverride,
      actor: args.actor,
      note: "import-run ocr stage",
    },
    repo,
  );
  if (!ocrGate.allowed) {
    ocrGate.blockers.forEach((b) => blockers.push({ stage: "ocr", reasonCode: b.reasonCode, detail: b.detail }));
    throw new Error(`OCR blocked by priority gate: ${ocrGate.blockers.map((b) => b.reasonCode).join(", ")}`);
  }

  let taggedRegions: Array<{ id: string; pageId: string }> = [];
  let ocrCompleted = 0;
  let ocrFailed = 0;
  let ocrConfidenceSum = 0;

  stageStart(stageTimings, "ocr");
  try {
    taggedRegions = windowedPages
      .flatMap((page) =>
        repo
          .listRegionsByPage(page.id)
          .filter((region) => region.status !== "failed" && region.status !== "unavailable")
          .filter((region) => Boolean(region.startVerseId) && Boolean(region.endVerseId))
          .map((region) => ({ id: region.id, pageId: page.id })),
      );

    if (taggedRegions.length === 0) {
      throw new Error("No tagged regions available. Review proposed regions and assign verse ranges before OCR.");
    }

    for (const region of taggedRegions) {
      try {
        const result = await runRegionOcr(region.id);
        ocrCompleted += 1;
        ocrConfidenceSum += result.ocrMeanConf;
        logProgress("ocr_progress", {
          witnessId: args.witnessId,
          completed: ocrCompleted,
          failed: ocrFailed,
          total: taggedRegions.length,
          regionId: region.id,
        });
      } catch {
        ocrFailed += 1;
        logProgress("ocr_progress", {
          witnessId: args.witnessId,
          completed: ocrCompleted,
          failed: ocrFailed,
          total: taggedRegions.length,
          regionId: region.id,
        });
      }
    }

    const batchStop = shouldStopBatch({
      mode: args.mode,
      ocrCompleted,
      ocrFailed,
      splitSuccess: 0,
      splitPartial: 0,
    });
    if (batchStop.stop) {
      throw new Error(batchStop.reasons.join("; "));
    }

    markStageCompleted(args.witnessId, "ocr", args.actor, "engine=tesseract");
    stageEnd(stageTimings, "ocr", "completed");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    markStageFailed(args.witnessId, "ocr", msg, args.actor);
    stageEnd(stageTimings, "ocr", "failed", msg);
    throw error;
  }

  const splitGate = evaluateSourceGate(
    {
      witnessId: args.witnessId,
      stage: "split",
      adminOverride: args.adminOverride,
      actor: args.actor,
      note: "import-run split stage",
    },
    repo,
  );
  if (!splitGate.allowed) {
    splitGate.blockers.forEach((b) => blockers.push({ stage: "split", reasonCode: b.reasonCode, detail: b.detail }));
    throw new Error(`Split blocked by priority gate: ${splitGate.blockers.map((b) => b.reasonCode).join(", ")}`);
  }

  let splitSuccess = 0;
  let splitPartial = 0;
  const verseIds = new Set<string>();

  stageStart(stageTimings, "split");
  try {
    for (const region of taggedRegions) {
      const split = await splitRegionIntoWitnessVerses(region.id);
      split.verseIds.forEach((verseId) => verseIds.add(verseId));
      if (split.status === "partial") splitPartial += 1;
      else splitSuccess += 1;
    }

    const batchStop = shouldStopBatch({
      mode: args.mode,
      ocrCompleted,
      ocrFailed,
      splitSuccess,
      splitPartial,
    });
    if (batchStop.stop) {
      throw new Error(batchStop.reasons.join("; "));
    }

    markStageCompleted(args.witnessId, "split", args.actor, "split complete");
    stageEnd(stageTimings, "split", "completed");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    markStageFailed(args.witnessId, "split", msg, args.actor);
    stageEnd(stageTimings, "split", "failed", msg);
    throw error;
  }

  const confGate = evaluateSourceGate(
    {
      witnessId: args.witnessId,
      stage: "confidence",
      adminOverride: args.adminOverride,
      actor: args.actor,
      note: "import-run confidence stage",
    },
    repo,
  );
  if (!confGate.allowed) {
    confGate.blockers.forEach((b) => blockers.push({ stage: "confidence", reasonCode: b.reasonCode, detail: b.detail }));
    throw new Error(`Confidence blocked by priority gate: ${confGate.blockers.map((b) => b.reasonCode).join(", ")}`);
  }

  stageStart(stageTimings, "confidence");
  try {
    for (const verseId of verseIds) {
      recomputeSourceConfidence(verseId);
      recomputeCascadeForVerse(verseId);
    }
    markStageCompleted(args.witnessId, "confidence", args.actor, "confidence recomputed");
    stageEnd(stageTimings, "confidence", "completed");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    markStageFailed(args.witnessId, "confidence", msg, args.actor);
    stageEnd(stageTimings, "confidence", "failed", msg);
    throw error;
  }

  const runFinishedAt = new Date().toISOString();
  const summaryBase = {
    witnessId: args.witnessId,
    mode: args.mode,
    startPage: args.startPage,
    pageCount: args.pageCount,
    adminOverride: args.adminOverride,
    actor: args.actor,
    engine: "tesseract" as const,
    pagesImported: importedPages,
    regionsAnnotated: windowedPages.flatMap((page) => repo.listRegionsByPage(page.id)).length,
    regionsOcrCompleted: ocrCompleted,
    regionsOcrFailed: ocrFailed,
    splitSuccess,
    splitPartial,
    meanOcrConfidence: ocrCompleted > 0 ? ocrConfidenceSum / ocrCompleted : 0,
    blockers,
    stageTimings,
    runStartedAt,
    runFinishedAt,
  };

  const reportPaths = writeRunReport(summaryBase);
  return {
    ...summaryBase,
    reportJsonPath: reportPaths.jsonPath,
    reportMarkdownPath: reportPaths.markdownPath,
  };
}
