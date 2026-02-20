import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const pageId = String(payload.pageId ?? "").trim();
  const proposalType = payload.proposalType === "blocks" ? "blocks" : "ranges";
  const proposalId = String(payload.proposalId ?? "").trim();
  const accepted = Boolean(payload.accepted);
  const confidence = Number(payload.confidence ?? 0);
  const hasGroundTruth = Boolean(payload.hasGroundTruth);
  if (!pageId || !proposalId) {
    return NextResponse.json({ error: "pageId and proposalId are required." }, { status: 400 });
  }

  const repo = getRepository();
  const feedback = repo.addAutomationFeedback({
    pageId,
    proposalType,
    proposalId,
    accepted,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    hasGroundTruth,
  });
  const metrics = repo.getAutomationMetrics(proposalType);
  return NextResponse.json({
    ok: true,
    feedback,
    metrics,
    model: proposalType === "blocks" ? "cv-row-projection-v1" : "ocr-alignment-v1",
  });
}
