import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import sharp from "sharp";

export type ManuscriptStatus = "ok" | "partial" | "unavailable" | "failed";

export class ManuscriptPipelineError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_PAGE_FORMAT"
      | "PDF_RASTERIZER_UNAVAILABLE"
      | "PDF_RASTERIZE_FAILED"
      | "INVALID_BBOX"
      | "BBOX_OUT_OF_BOUNDS",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface PageRasterResult {
  rasterPath: string;
  width: number;
  height: number;
  sourceType: "image" | "pdf";
  sourcePath: string;
  sourcePageIndex: number;
  cleanup: string[];
}

export interface NormalizedBbox {
  pixel: { x: number; y: number; w: number; h: number };
  normalized: { x: number; y: number; w: number; h: number };
  normalizationMode: "normalized" | "pixel";
}

export interface CropResult {
  cropPath: string;
  width: number;
  height: number;
  sha256: string;
  metadata: Record<string, unknown>;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function isPdfPath(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".pdf";
}

export function normalizeBbox(
  bbox: { x: number; y: number; w: number; h: number },
  pageSize: { width: number; height: number },
): NormalizedBbox {
  const vals = [bbox.x, bbox.y, bbox.w, bbox.h];
  if (vals.some((v) => !Number.isFinite(v)) || bbox.w <= 0 || bbox.h <= 0) {
    throw new ManuscriptPipelineError("INVALID_BBOX", "bbox must contain finite positive x/y/w/h", { bbox });
  }

  const normalizedInput = vals.every((v) => v >= 0 && v <= 1);
  const pixel = normalizedInput
    ? {
        x: Math.round(bbox.x * pageSize.width),
        y: Math.round(bbox.y * pageSize.height),
        w: Math.round(bbox.w * pageSize.width),
        h: Math.round(bbox.h * pageSize.height),
      }
    : {
        x: Math.round(bbox.x),
        y: Math.round(bbox.y),
        w: Math.round(bbox.w),
        h: Math.round(bbox.h),
      };

  if (pixel.x < 0 || pixel.y < 0 || pixel.w <= 0 || pixel.h <= 0 || pixel.x + pixel.w > pageSize.width || pixel.y + pixel.h > pageSize.height) {
    throw new ManuscriptPipelineError("BBOX_OUT_OF_BOUNDS", "bbox exceeds source page dimensions", {
      bbox,
      pageSize,
      pixel,
    });
  }

  return {
    pixel,
    normalized: {
      x: pixel.x / pageSize.width,
      y: pixel.y / pageSize.height,
      w: pixel.w / pageSize.width,
      h: pixel.h / pageSize.height,
    },
    normalizationMode: normalizedInput ? "normalized" : "pixel",
  };
}

export function rasterizePageIfNeeded(pagePath: string, outDir: string, pageIndex = 1): PageRasterResult {
  ensureDir(outDir);

  if (!isPdfPath(pagePath)) {
    return {
      rasterPath: pagePath,
      width: 0,
      height: 0,
      sourceType: "image",
      sourcePath: pagePath,
      sourcePageIndex: pageIndex,
      cleanup: [],
    };
  }

  const pageBase = path.join(outDir, `${path.basename(pagePath, path.extname(pagePath))}-p${pageIndex}`);
  const result = spawnSync("pdftoppm", ["-f", String(pageIndex), "-singlefile", "-png", pagePath, pageBase], {
    encoding: "utf8",
  });

  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new ManuscriptPipelineError("PDF_RASTERIZER_UNAVAILABLE", "pdftoppm is required for PDF imports", {
      pagePath,
    });
  }

  if (result.status !== 0) {
    throw new ManuscriptPipelineError("PDF_RASTERIZE_FAILED", "failed to rasterize PDF page", {
      pagePath,
      stderr: result.stderr,
    });
  }

  const rasterPath = `${pageBase}.png`;
  if (!fs.existsSync(rasterPath)) {
    throw new ManuscriptPipelineError("PDF_RASTERIZE_FAILED", "rasterized PDF output was not created", { pagePath, rasterPath });
  }

  return {
    rasterPath,
    width: 0,
    height: 0,
    sourceType: "pdf",
    sourcePath: pagePath,
    sourcePageIndex: pageIndex,
    cleanup: [rasterPath],
  };
}

export async function createDeterministicCrop(input: {
  pagePath: string;
  pageIndex?: number;
  bbox: { x: number; y: number; w: number; h: number };
  outDir: string;
  regionId: string;
}): Promise<CropResult> {
  ensureDir(input.outDir);
  const raster = rasterizePageIfNeeded(input.pagePath, input.outDir, input.pageIndex ?? 1);

  try {
    const image = sharp(raster.rasterPath, { pages: 1 });
    const meta = await image.metadata();
    const width = Number(meta.width ?? 0);
    const height = Number(meta.height ?? 0);
    if (!width || !height) {
      throw new ManuscriptPipelineError("UNSUPPORTED_PAGE_FORMAT", "Unable to read image metadata for crop", {
        pagePath: input.pagePath,
      });
    }

    const bbox = normalizeBbox(input.bbox, { width, height });
    const cropPath = path.join(input.outDir, `${input.regionId.replace(/[^a-zA-Z0-9_-]+/g, "_")}.png`);
    await image
      .extract({
        left: bbox.pixel.x,
        top: bbox.pixel.y,
        width: bbox.pixel.w,
        height: bbox.pixel.h,
      })
      .png({ compressionLevel: 9, palette: false, effort: 10 })
      .toFile(cropPath);

    const data = fs.readFileSync(cropPath);
    const sha256 = crypto.createHash("sha256").update(data).digest("hex");

    return {
      cropPath,
      width: bbox.pixel.w,
      height: bbox.pixel.h,
      sha256,
      metadata: {
        source: {
          pagePath: input.pagePath,
          rasterPath: raster.rasterPath,
          sourceType: raster.sourceType,
          sourcePageIndex: raster.sourcePageIndex,
          width,
          height,
        },
        bbox: {
          requested: input.bbox,
          pixel: bbox.pixel,
          normalized: bbox.normalized,
          normalizationMode: bbox.normalizationMode,
        },
        output: {
          format: "png",
          width: bbox.pixel.w,
          height: bbox.pixel.h,
          sha256,
        },
      },
    };
  } finally {
    for (const filePath of raster.cleanup) {
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    }
  }
}

export async function analyzePageForImport(pagePath: string, outDir: string, pageIndex = 1): Promise<{
  thumbnailPath: string | null;
  quality: Record<string, unknown>;
  status: ManuscriptStatus;
}> {
  ensureDir(outDir);
  const ext = path.extname(pagePath).toLowerCase();
  const baseQuality: Record<string, unknown> = {
    extension: ext,
    fileSizeBytes: fs.statSync(pagePath).size,
  };

  try {
    const raster = rasterizePageIfNeeded(pagePath, outDir, pageIndex);
    const image = sharp(raster.rasterPath, { pages: 1 });
    const [meta, stats] = await Promise.all([image.metadata(), image.stats()]);

    const width = Number(meta.width ?? 0);
    const height = Number(meta.height ?? 0);
    const dpi = Number(meta.density ?? 0) || null;
    const contrastProxy = stats.channels.length
      ? Math.min(1, Math.max(0, stats.channels.reduce((sum, c) => sum + c.stdev, 0) / stats.channels.length / 128))
      : 0;
    const blurProxy = Number.isFinite(stats.sharpness) ? Math.max(0, Math.min(1, 1 - stats.sharpness)) : null;
    const noiseProxy = Number.isFinite(stats.entropy) ? Math.max(0, Math.min(1, stats.entropy / 8)) : null;

    const thumbnailPath = path.join(outDir, `${path.basename(pagePath, ext)}-thumb.jpg`);
    await image.resize({ width: 360, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(thumbnailPath);

    for (const filePath of raster.cleanup) {
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    }

    const status: ManuscriptStatus = ext === ".pdf" ? "partial" : "ok";
    return {
      thumbnailPath,
      quality: {
        ...baseQuality,
        width,
        height,
        dpi,
        contrastProxy,
        blurProxy,
        noiseProxy,
        thumbnailGenerated: true,
        pdfHandling: ext === ".pdf" ? "first-page-raster" : null,
      },
      status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "quality analysis failed";
    return {
      thumbnailPath: null,
      quality: {
        ...baseQuality,
        thumbnailGenerated: false,
        qualityError: message,
      },
      status: ext === ".pdf" ? "partial" : "failed",
    };
  }
}
