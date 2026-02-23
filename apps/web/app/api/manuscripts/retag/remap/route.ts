import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { backfillWitnessFromRemap, remapWitnessRegionsBySnippet } from "@/lib/manuscripts-pipeline";

export async function POST(request: Request) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const witnessId = String(payload.witnessId ?? "").trim();
  if (!witnessId) return NextResponse.json({ error: "witnessId is required." }, { status: 400 });

  const minScore = Number(payload.minScore ?? 0.78);
  const minMargin = Number(payload.minMargin ?? 0.08);
  const maxWindow = Number(payload.maxWindow ?? 5);
  const runBackfill = Boolean(payload.runBackfill ?? true);

  try {
    const remap = await remapWitnessRegionsBySnippet({ witnessId, minScore, minMargin, maxWindow });
    const backfill = runBackfill ? await backfillWitnessFromRemap(witnessId) : null;
    return NextResponse.json({ ok: true, remap, backfill });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Remap failed." }, { status: 400 });
  }
}
