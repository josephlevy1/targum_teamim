import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";
import { runTaamAlignmentForVerse } from "@/lib/manuscripts-pipeline";

export async function POST(request: Request) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const targetLayer = String(payload.targetLayer ?? "working_text");
  const verseId = String(payload.verseId ?? "").trim();
  const witnessId = String(payload.witnessId ?? "").trim();

  const repo = getRepository();
  const job = repo.createTaamAlignmentJob({ kind: "align", witnessId: witnessId || null, verseRange: verseId || null });
  repo.updateTaamAlignmentJobStatus(job.id, "running");
  try {
    const verseIds = verseId
      ? [verseId]
      : witnessId
        ? Array.from(new Set(repo.listRegionsByWitness(witnessId).flatMap((region) => [region.startVerseId, region.endVerseId]).filter(Boolean) as string[]))
        : repo.listVerseIds();

    const results = verseIds.map((id) => runTaamAlignmentForVerse(id, targetLayer));
    repo.updateTaamAlignmentJobStatus(job.id, "completed");
    return NextResponse.json({ ok: true, jobId: job.id, results });
  } catch (error) {
    repo.updateTaamAlignmentJobStatus(job.id, "failed", error instanceof Error ? error.message : "taam alignment failed");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Taam alignment failed." }, { status: 400 });
  }
}
