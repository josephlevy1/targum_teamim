import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET() {
  const repo = getRepository();
  const verseIds = repo.listVerseIds();
  const items = verseIds.map((verseId) => {
    const working = repo.getWorkingVerseText(verseId);
    const witnesses = repo.listWitnessVersesForVerse(verseId).map((row) => ({
      witnessId: row.witnessId,
      sourceConfidence: row.sourceConfidence,
      clarityScore: row.clarityScore,
      matchScore: row.matchScore,
      completenessScore: row.completenessScore,
      status: row.status,
    }));
    return {
      verseId,
      selectedSource: working?.selectedSource ?? "baseline_digital",
      ensembleConfidence: working?.ensembleConfidence ?? 0.45,
      flags: working?.flags ?? [],
      reasonCodes: working?.reasonCodes ?? [],
      witnessConfidences: witnesses,
    };
  });

  return NextResponse.json({ normalization: "NFC", items });
}
