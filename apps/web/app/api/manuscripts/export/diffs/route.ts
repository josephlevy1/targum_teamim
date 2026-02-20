import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET() {
  const repo = getRepository();
  const verseIds = repo.listVerseIds();
  const items = verseIds.flatMap((verseId) =>
    repo.listWitnessVersesForVerse(verseId).map((row) => ({
      verseId,
      witnessId: row.witnessId,
      diffOps: (row.artifacts as { tokenDiffOps?: unknown }).tokenDiffOps ?? [],
      artifacts: row.artifacts,
    })),
  );

  return NextResponse.json({ items });
}
