import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { splitRegionIntoWitnessVerses } from "@/lib/manuscripts-pipeline";
import { getRepository } from "@/lib/repository";
import { evaluateSourceGate, markStageCompleted, markStageFailed } from "@/lib/manuscripts-gating";

export async function POST(_: Request, ctx: { params: Promise<{ regionId: string }> }) {
  let username = "local-user";
  try {
    const user = await requireEditorUser();
    username = user.username;
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { regionId } = await ctx.params;
  try {
    const repo = getRepository();
    const region = repo.getPageRegion(regionId);
    if (!region) return NextResponse.json({ error: "Region not found." }, { status: 404 });
    const page = repo.getPage(region.pageId);
    if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

    const gate = evaluateSourceGate({ witnessId: page.witnessId, stage: "split", actor: username });
    if (!gate.allowed) {
      return NextResponse.json({ error: "Priority gate blocked split run.", blockers: gate.blockers }, { status: 409 });
    }

    const result = await splitRegionIntoWitnessVerses(regionId);
    markStageCompleted(page.witnessId, "split", username, `Split region ${regionId}`);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const repo = getRepository();
    const region = repo.getPageRegion(regionId);
    const page = region ? repo.getPage(region.pageId) : null;
    if (page) {
      markStageFailed(page.witnessId, "split", error instanceof Error ? error.message : "Split failed.", username);
    }
    const message = error instanceof Error ? error.message : "Split failed.";
    const errorCode =
      typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    return NextResponse.json({ error: message, errorCode }, { status: 400 });
  }
}
