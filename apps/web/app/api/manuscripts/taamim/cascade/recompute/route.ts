import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";
import { recomputeTaamConsensusForVerse } from "@/lib/manuscripts-pipeline";

export async function POST(request: Request) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const targetLayer = String(payload.targetLayer ?? "working_text");
  const verseId = String(payload.verseId ?? "").trim();

  const repo = getRepository();
  const job = repo.createTaamAlignmentJob({ kind: "cascade", verseRange: verseId || null, witnessId: null });
  repo.updateTaamAlignmentJobStatus(job.id, "running");
  try {
    const verseIds = verseId ? [verseId] : repo.listVerseIds();
    const results = verseIds.map((id) => recomputeTaamConsensusForVerse(id, targetLayer));
    repo.updateTaamAlignmentJobStatus(job.id, "completed");
    return NextResponse.json({ ok: true, jobId: job.id, results });
  } catch (error) {
    repo.updateTaamAlignmentJobStatus(job.id, "failed", error instanceof Error ? error.message : "taam cascade failed");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Taam cascade failed." }, { status: 400 });
  }
}
