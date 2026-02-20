import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { runRegionOcr } from "@/lib/manuscripts-pipeline";
import { getRepository } from "@/lib/repository";
import { evaluateSourceGate, markStageCompleted, markStageFailed } from "@/lib/manuscripts-gating";

export async function POST(request: Request) {
  let username = "local-user";
  try {
    const user = await requireEditorUser();
    username = user.username;
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const regionId = String(payload.regionId ?? "").trim();
  const adminOverride = Boolean(payload.adminOverride);
  if (!regionId) {
    return NextResponse.json({ error: "regionId is required." }, { status: 400 });
  }

  try {
    const repo = getRepository();
    const region = repo.getPageRegion(regionId);
    if (!region) return NextResponse.json({ error: "Region not found." }, { status: 404 });
    const page = repo.getPage(region.pageId);
    if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });

    const gate = evaluateSourceGate({ witnessId: page.witnessId, stage: "ocr", adminOverride, actor: username });
    if (!gate.allowed) {
      return NextResponse.json({ error: "Priority gate blocked OCR run.", blockers: gate.blockers }, { status: 409 });
    }

    const result = await runRegionOcr(regionId);
    const progress = repo.getWitnessProgress(page.witnessId);
    if (progress.regionsPendingOcr === 0) {
      markStageCompleted(page.witnessId, "ocr", username, "All regions OCR complete");
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const repo = getRepository();
    const region = repo.getPageRegion(regionId);
    const page = region ? repo.getPage(region.pageId) : null;
    if (page) {
      markStageFailed(page.witnessId, "ocr", error instanceof Error ? error.message : "OCR failed.", username);
    }
    const message = error instanceof Error ? error.message : "OCR failed.";
    const errorCode =
      typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    return NextResponse.json({ error: message, errorCode }, { status: 400 });
  }
}
