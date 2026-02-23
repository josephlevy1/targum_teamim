import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET() {
  const repo = getRepository();
  const witnesses = repo.getManuscriptOpsSnapshot();
  const taamJobs = repo.listTaamAlignmentJobs();
  const reviewQueueLow = repo.listTextReviewQueue("low_confidence").length;
  const reviewQueueDisagreement = repo.listTextReviewQueue("disagreement").length;
  const reviewQueueUnavailable = repo.listTextReviewQueue("unavailable_partial").length;
  const remapAmbiguous = witnesses.reduce((sum, row) => {
    const regions = repo.listRegionsByWitness(row.witnessId);
    return sum + regions.filter((region) => region.remapReviewRequired).length;
  }, 0);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    witnesses,
    queues: {
      textLowConfidence: reviewQueueLow,
      textDisagreement: reviewQueueDisagreement,
      textUnavailablePartial: reviewQueueUnavailable,
      remapAmbiguous,
    },
    jobs: {
      taamQueued: taamJobs.filter((job) => job.status === "queued").length,
      taamRunning: taamJobs.filter((job) => job.status === "running").length,
      taamFailed: taamJobs.filter((job) => job.status === "failed").length,
      taamCompleted: taamJobs.filter((job) => job.status === "completed").length,
    },
  });
}
