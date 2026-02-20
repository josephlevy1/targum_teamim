import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { runRegionOcr } from "@/lib/manuscripts-pipeline";
import { getRepository } from "@/lib/repository";
import { evaluateSourceGate } from "@/lib/manuscripts-gating";

export async function POST(_: Request, ctx: { params: Promise<{ jobId: string }> }) {
  let username = "local-user";
  try {
    const user = await requireEditorUser();
    username = user.username;
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await ctx.params;
  const repo = getRepository();
  const job = repo.getOcrJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  try {
    const region = repo.getPageRegion(job.regionId);
    if (!region) return NextResponse.json({ error: "Region not found." }, { status: 404 });
    const page = repo.getPage(region.pageId);
    if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
    const gate = evaluateSourceGate({ witnessId: page.witnessId, stage: "ocr", actor: username });
    if (!gate.allowed) {
      return NextResponse.json({ error: "Priority gate blocked OCR retry.", blockers: gate.blockers }, { status: 409 });
    }

    const result = await runRegionOcr(job.regionId);
    return NextResponse.json({ ok: true, retriedJobId: jobId, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Retry failed." }, { status: 400 });
  }
}
