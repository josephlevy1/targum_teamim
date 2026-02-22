import { cpus } from "node:os";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { getRepository } from "../lib/repository";
import { createRegionCropAsync } from "../lib/manuscripts-pipeline";
import { runOcrWithRetry } from "../lib/manuscripts-ocr";

type Args = {
  workers: number;
  staleMinutes: number;
  witness?: string;
  retryFailed: boolean;
  autoClampBbox: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    workers: Math.max(1, Math.min(16, (cpus()?.length ?? 4) - 1)),
    staleMinutes: 20,
    retryFailed: true,
    autoClampBbox: true,
  };
  for (const arg of argv) {
    if (arg.startsWith("--workers=")) out.workers = Math.max(1, Number(arg.split("=")[1] ?? out.workers));
    if (arg.startsWith("--stale-minutes=")) out.staleMinutes = Math.max(1, Number(arg.split("=")[1] ?? out.staleMinutes));
    if (arg.startsWith("--witness=")) out.witness = String(arg.split("=")[1] ?? "").trim() || undefined;
    if (arg === "--retry-failed=false") out.retryFailed = false;
    if (arg === "--auto-clamp-bbox=false") out.autoClampBbox = false;
  }
  return out;
}

function ensureTesseractHebrew(): void {
  process.env.MANUSCRIPT_OCR_ENGINE = "tesseract";
  process.env.MANUSCRIPT_OCR_COMMAND = "tesseract";
  process.env.MANUSCRIPT_OCR_LANG = process.env.MANUSCRIPT_OCR_LANG || "heb";
  process.env.MANUSCRIPT_OCR_COMMAND_ARGS = "";

  const version = spawnSync("tesseract", ["--version"], { encoding: "utf8" });
  if (version.error || version.status !== 0) {
    throw new Error("tesseract is not available on PATH.");
  }
  const langs = spawnSync("tesseract", ["--list-langs"], { encoding: "utf8" });
  if (langs.error || langs.status !== 0) {
    throw new Error("tesseract language list check failed.");
  }
  if (!/\bheb\b/.test(langs.stdout)) {
    throw new Error("tesseract Hebrew language pack (heb) is missing.");
  }
}

function isBboxError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /bbox exceeds source page dimensions/i.test(err.message);
}

async function clampRegionToPage(regionId: string): Promise<boolean> {
  const repo = getRepository();
  const region = repo.getPageRegion(regionId);
  if (!region) return false;
  const page = repo.getPage(region.pageId);
  if (!page) return false;

  const meta = await sharp(page.imagePath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) return false;

  const x = Math.max(0, Math.min(region.bbox.x, width - 1));
  const y = Math.max(0, Math.min(region.bbox.y, height - 1));
  const w = Math.max(1, Math.min(region.bbox.w, width - x));
  const h = Math.max(1, Math.min(region.bbox.h, height - y));
  const changed = x !== region.bbox.x || y !== region.bbox.y || w !== region.bbox.w || h !== region.bbox.h;
  if (!changed) return false;

  repo.upsertPageRegion({
    id: region.id,
    pageId: region.pageId,
    regionIndex: region.regionIndex,
    bbox: { x, y, w, h },
    startVerseId: region.startVerseId,
    endVerseId: region.endVerseId,
    status: region.status,
    notes: region.notes ? `${region.notes} | bbox auto-clamped` : "bbox auto-clamped",
  });
  return true;
}

function requeueStaleRunningJobs(staleMinutes: number): number {
  const repo = getRepository();
  const now = Date.now();
  const staleMs = staleMinutes * 60_000;
  let count = 0;
  for (const job of repo.listOcrJobs("running")) {
    const started = job.startedAt ? Date.parse(job.startedAt) : 0;
    if (!started || Number.isNaN(started) || now - started >= staleMs) {
      repo.updateOcrJobStatus(job.id, "queued");
      count += 1;
    }
  }
  return count;
}

function enqueueMissingJobs(witnessFilter?: string, retryFailed = true): number {
  const repo = getRepository();
  const snapshots = repo.getManuscriptOpsSnapshot().sort((a, b) => (a.sourcePriority ?? 999) - (b.sourcePriority ?? 999));
  const witnesses = witnessFilter ? snapshots.filter((w) => w.witnessId === witnessFilter) : snapshots;
  const latestByRegion = new Map<string, string>();
  for (const job of repo.listOcrJobs()) {
    if (!latestByRegion.has(job.regionId)) latestByRegion.set(job.regionId, job.status);
  }

  let queued = 0;
  for (const witness of witnesses) {
    for (const page of repo.listPagesByWitness(witness.witnessId)) {
      for (const region of repo.listRegionsByPage(page.id)) {
        if (region.status === "failed" || region.status === "unavailable") continue;
        if (!region.startVerseId || !region.endVerseId) continue;
        if (repo.getRegionOcrArtifact(region.id)) continue;

        const latest = latestByRegion.get(region.id);
        if (latest === "running" || latest === "queued") continue;
        if (!retryFailed && latest === "failed") continue;
        repo.createOcrJob(region.id);
        queued += 1;
      }
    }
  }
  return queued;
}

async function processJob(jobId: string, autoClampBbox: boolean): Promise<"completed" | "failed"> {
  const repo = getRepository();
  const job = repo.getOcrJob(jobId);
  if (!job) return "failed";
  const region = repo.getPageRegion(job.regionId);
  if (!region || !region.startVerseId || !region.endVerseId) {
    repo.updateOcrJobStatus(job.id, "failed", "Region missing or untagged.");
    return "failed";
  }
  const page = repo.getPage(region.pageId);
  if (!page) {
    repo.updateOcrJobStatus(job.id, "failed", "Page missing.");
    return "failed";
  }

  const runOnce = async (): Promise<void> => {
    const crop = await createRegionCropAsync(region.id);
    const ocr = await runOcrWithRetry(crop.cropPath);
    repo.upsertRegionOcrArtifact({
      regionId: region.id,
      cropPath: crop.cropPath,
      cropMetadata: crop.cropMetadata,
      textRaw: ocr.textRaw,
      ocrMeanConf: ocr.meanConfidence,
      ocrCharCount: ocr.charCount,
      coverageRatioEst: ocr.coverageEstimate,
      engine: ocr.engine,
    });
  };

  try {
    await runOnce();
    repo.updateOcrJobStatus(job.id, "completed");
    return "completed";
  } catch (error) {
    if (autoClampBbox && isBboxError(error)) {
      const clamped = await clampRegionToPage(region.id);
      if (clamped) {
        try {
          await runOnce();
          repo.updateOcrJobStatus(job.id, "completed");
          return "completed";
        } catch (retryErr) {
          repo.updateOcrJobStatus(job.id, "failed", retryErr instanceof Error ? retryErr.message : "OCR failure");
          return "failed";
        }
      }
    }
    repo.updateOcrJobStatus(job.id, "failed", error instanceof Error ? error.message : "OCR failure");
    return "failed";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureTesseractHebrew();
  const repo = getRepository();

  const requeued = requeueStaleRunningJobs(args.staleMinutes);
  const enqueued = enqueueMissingJobs(args.witness, args.retryFailed);
  const initialQueued = repo.listOcrJobs("queued").length;
  const running = repo.listOcrJobs("running").length;
  console.log(
    `OCR worker start workers=${args.workers} stale_requeued=${requeued} newly_enqueued=${enqueued} queued_now=${initialQueued} running_now=${running}`,
  );

  const inFlight = new Set<string>();
  let completed = 0;
  let failed = 0;
  let idleWorkers = 0;

  const claimNext = (): string | null => {
    const queued = repo.listOcrJobs("queued");
    if (queued.length === 0) return null;
    let candidate = queued[queued.length - 1];
    for (const job of queued) {
      if (inFlight.has(job.id)) continue;
      if (Date.parse(job.createdAt) < Date.parse(candidate.createdAt)) candidate = job;
    }
    if (inFlight.has(candidate.id)) return null;
    inFlight.add(candidate.id);
    repo.updateOcrJobStatus(candidate.id, "running");
    return candidate.id;
  };

  const worker = async (workerId: number): Promise<void> => {
    while (true) {
      const jobId = claimNext();
      if (!jobId) {
        idleWorkers += 1;
        return;
      }
      const result = await processJob(jobId, args.autoClampBbox);
      inFlight.delete(jobId);
      if (result === "completed") completed += 1;
      else failed += 1;
      if ((completed + failed) % 10 === 0) {
        const q = repo.listOcrJobs("queued").length;
        const r = repo.listOcrJobs("running").length;
        console.log(`progress worker=${workerId} completed=${completed} failed=${failed} queued=${q} running=${r}`);
      }
    }
  };

  await Promise.all(Array.from({ length: args.workers }, (_, i) => worker(i + 1)));
  const remainingQueued = repo.listOcrJobs("queued").length;
  const remainingRunning = repo.listOcrJobs("running").length;
  console.log(
    `OCR worker done completed=${completed} failed=${failed} remaining_queued=${remainingQueued} remaining_running=${remainingRunning} idle_workers=${idleWorkers}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

