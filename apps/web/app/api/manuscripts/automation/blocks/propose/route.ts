import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";
import sharp from "sharp";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const pageId = String(payload.pageId ?? "").trim();
  if (!pageId) return NextResponse.json({ error: "pageId is required." }, { status: 400 });

  const repo = getRepository();
  const page = repo.getPage(pageId);
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  try {
    const sourcePath = page.thumbnailPath ?? page.imagePath;
    const image = sharp(sourcePath).greyscale();
    const meta = await image.metadata();
    const width = Number(meta.width ?? 0);
    const height = Number(meta.height ?? 0);
    if (!width || !height) {
      return NextResponse.json({ error: "Image dimensions unavailable for block proposal." }, { status: 400 });
    }

    const { data } = await image.raw().toBuffer({ resolveWithObject: true });
    const rowInk = new Array<number>(height).fill(0);
    for (let y = 0; y < height; y += 1) {
      let darkPixels = 0;
      for (let x = 0; x < width; x += 1) {
        const value = data[y * width + x] ?? 255;
        if (value < 185) darkPixels += 1;
      }
      rowInk[y] = darkPixels / width;
    }

    const lineThreshold = 0.08;
    const minBandHeight = Math.max(8, Math.floor(height * 0.012));
    const bands: Array<{ start: number; end: number }> = [];
    let bandStart: number | null = null;
    for (let y = 0; y < height; y += 1) {
      if (rowInk[y] >= lineThreshold && bandStart === null) bandStart = y;
      if (rowInk[y] < lineThreshold && bandStart !== null) {
        if (y - bandStart >= minBandHeight) bands.push({ start: bandStart, end: y });
        bandStart = null;
      }
    }
    if (bandStart !== null && height - bandStart >= minBandHeight) bands.push({ start: bandStart, end: height - 1 });

    const merged: Array<{ start: number; end: number }> = [];
    const mergeGap = Math.max(6, Math.floor(height * 0.01));
    for (const band of bands) {
      const last = merged[merged.length - 1];
      if (last && band.start - last.end <= mergeGap) {
        last.end = band.end;
      } else {
        merged.push({ ...band });
      }
    }

    const proposals = merged.slice(0, 20).map((band, index) => ({
      regionIndex: index + 1,
      bbox: {
        x: Math.floor(width * 0.06),
        y: band.start,
        w: Math.floor(width * 0.88),
        h: Math.max(minBandHeight, band.end - band.start),
      },
      score: Math.max(0, Math.min(1, merged.length ? 1 - index / merged.length : 0)),
    }));

    return NextResponse.json({ pageId, proposals, model: "cv-row-projection-v1" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Proposal failed." }, { status: 400 });
  }
}
