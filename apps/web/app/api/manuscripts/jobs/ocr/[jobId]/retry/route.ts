import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { runRegionOcr } from "@/lib/manuscripts-pipeline";
import { getRepository } from "@/lib/repository";

export async function POST(_: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await ctx.params;
  const repo = getRepository();
  const job = repo.getOcrJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  try {
    const result = runRegionOcr(job.regionId);
    return NextResponse.json({ ok: true, retriedJobId: jobId, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Retry failed." }, { status: 400 });
  }
}
