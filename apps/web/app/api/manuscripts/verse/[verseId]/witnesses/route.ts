import { NextResponse } from "next/server";
import { MANUSCRIPT_NORMALIZATION_FORM } from "@targum/core";
import { getRepository } from "@/lib/repository";
import { enrichWitnessArtifacts, sortWitnessRows } from "@/lib/manuscripts-witness-payload";

function normalizeComparisonText(text: string): string {
  return text
    .normalize(MANUSCRIPT_NORMALIZATION_FORM)
    .replace(/\s+/g, " ")
    .trim();
}

function renderAramaicFromVerseId(verseId: string): string {
  const repo = getRepository();
  const record = repo.getVerseRecord(verseId as any);
  if (!record) return "";
  return record.verse.aramaicTokens
    .map((token) => token.letters.map((letter) => `${letter.baseChar}${letter.niqqud.join("")}`).join(""))
    .join(" ");
}

export async function GET(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const repo = getRepository();
  const witnesses = enrichWitnessArtifacts(sortWitnessRows(repo.listWitnessVersesForVerse(verseId)));
  const working = repo.getWorkingVerseText(verseId);
  const baselineSurface = renderAramaicFromVerseId(verseId);
  return NextResponse.json({
    verseId,
    baseline: {
      textSurface: baselineSurface,
      textNormalized: normalizeComparisonText(baselineSurface),
    },
    witnesses,
    working,
  });
}
