import { NextResponse } from "next/server";
import { compareVerseIdsCanonical } from "@targum/core";
import { getRepository } from "@/lib/repository";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const pageId = String(payload.pageId ?? "").trim();
  if (!pageId) return NextResponse.json({ error: "pageId is required." }, { status: 400 });

  const repo = getRepository();
  const page = repo.getPage(pageId);
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  const verseIds = repo.listVerseIds().sort(compareVerseIdsCanonical);
  const regions = repo.listRegionsByPage(pageId);
  const proposals = regions.map((region, idx) => {
    const start = verseIds[idx * 3] ?? verseIds[0] ?? "";
    const end = verseIds[Math.min(idx * 3 + 2, verseIds.length - 1)] ?? start;
    return {
      regionId: region.id,
      startVerseId: start,
      endVerseId: end,
      confidence: 0.6,
      method: "baseline-window-v1",
    };
  });

  return NextResponse.json({ pageId, proposals });
}
