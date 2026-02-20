import { NextResponse } from "next/server";
import { compareVerseIdsCanonical } from "@targum/core";
import { getRepository } from "@/lib/repository";
import { alignWitnessToBaseline } from "@/lib/manuscripts-pipeline";

function normalize(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const pageId = String(payload.pageId ?? "").trim();
  if (!pageId) return NextResponse.json({ error: "pageId is required." }, { status: 400 });

  const repo = getRepository();
  const page = repo.getPage(pageId);
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

  const regions = repo.listRegionsByPage(pageId);
  const verseIds = repo.listVerseIds().sort(compareVerseIdsCanonical);
  const baselineByVerse = new Map(
    verseIds.map((verseId) => {
      const record = repo.getVerseRecord(verseId);
      const text =
        record?.verse.aramaicTokens.map((token) => token.letters.map((letter) => `${letter.baseChar}${letter.niqqud.join("")}`).join("")).join(" ") ??
        "";
      return [verseId, normalize(text)];
    }),
  );

  const maxWindow = 5;
  const proposals = regions.map((region) => {
    const ocr = repo.getRegionOcrArtifact(region.id);
    const ocrText = normalize(ocr?.textRaw ?? "");
    if (!ocrText) {
      return {
        regionId: region.id,
        startVerseId: region.startVerseId,
        endVerseId: region.endVerseId,
        confidence: 0,
        method: "ocr-alignment-v1",
        reason: "OCR_EMPTY",
      };
    }

    let best: { start: string; end: string; score: number } | null = null;
    for (let startIdx = 0; startIdx < verseIds.length; startIdx += 1) {
      let windowText = "";
      for (let width = 1; width <= maxWindow && startIdx + width - 1 < verseIds.length; width += 1) {
        const currentVerseId = verseIds[startIdx + width - 1];
        windowText = `${windowText} ${baselineByVerse.get(currentVerseId) ?? ""}`.trim();
        const score = alignWitnessToBaseline(ocrText, windowText).matchScore;
        if (!best || score > best.score) {
          best = { start: verseIds[startIdx], end: currentVerseId, score };
        }
      }
    }

    if (!best) {
      return {
        regionId: region.id,
        startVerseId: region.startVerseId,
        endVerseId: region.endVerseId,
        confidence: 0,
        method: "ocr-alignment-v1",
        reason: "NO_CANDIDATE",
      };
    }

    return {
      regionId: region.id,
      startVerseId: best.start,
      endVerseId: best.end,
      confidence: best.score,
      method: "ocr-alignment-v1",
    };
  });

  return NextResponse.json({ pageId, proposals });
}
