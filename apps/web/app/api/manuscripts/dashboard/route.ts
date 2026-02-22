import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET() {
  const repo = getRepository();
  const witnesses = repo.getManuscriptOpsSnapshot();

  const summary = witnesses.reduce(
    (acc, row) => {
      acc.sources += 1;
      acc.pagesImported += row.pagesImported;
      acc.regionsTagged += row.regionsTagged;
      acc.regionsEligibleForOcr += row.regionsEligibleForOcr;
      acc.ocrArtifacts += row.ocrArtifacts;
      acc.ocrQueued += row.ocrJobsQueued;
      acc.ocrRunning += row.ocrJobsRunning;
      acc.ocrFailed += row.ocrJobsFailed;
      acc.splitRows += row.splitRows;
      if (row.ocrStatus === "blocked") acc.blockedSources += 1;
      if (row.confidenceStatus === "completed") acc.completedSources += 1;
      return acc;
    },
    {
      sources: 0,
      pagesImported: 0,
      regionsTagged: 0,
      regionsEligibleForOcr: 0,
      ocrArtifacts: 0,
      ocrQueued: 0,
      ocrRunning: 0,
      ocrFailed: 0,
      splitRows: 0,
      blockedSources: 0,
      completedSources: 0,
    },
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary,
    witnesses,
  });
}
