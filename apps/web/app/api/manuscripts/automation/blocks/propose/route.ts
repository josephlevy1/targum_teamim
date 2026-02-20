import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const pageId = String(payload.pageId ?? "").trim();
  if (!pageId) return NextResponse.json({ error: "pageId is required." }, { status: 400 });

  const repo = getRepository();
  const page = repo.getPage(pageId);
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  const width = Number((page.quality as { width?: number }).width ?? 1200);
  const height = Number((page.quality as { height?: number }).height ?? 1800);
  const blockHeight = Math.max(120, Math.floor(height / 10));
  const proposals = Array.from({ length: 5 }).map((_, idx) => ({
    regionIndex: idx + 1,
    bbox: {
      x: Math.floor(width * 0.1),
      y: Math.floor(height * 0.08) + idx * blockHeight,
      w: Math.floor(width * 0.8),
      h: Math.floor(blockHeight * 0.8),
    },
  }));

  return NextResponse.json({ pageId, proposals, model: "heuristic-v1" });
}
