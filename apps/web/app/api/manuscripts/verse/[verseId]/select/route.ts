import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";

export async function POST(request: Request, ctx: { params: Promise<{ verseId: string }> }) {
  let username = "local-user";
  try {
    const user = await requireEditorUser();
    username = user.username;
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
  }

  const { verseId } = await ctx.params;
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const repo = getRepository();

  const selectedSource = String(payload.selectedSource ?? "").trim();
  const selectedTextSurface = String(payload.selectedTextSurface ?? "").trim();
  const selectedTextNormalized = String(payload.selectedTextNormalized ?? selectedTextSurface).trim();
  const ensembleConfidence = Number(payload.ensembleConfidence ?? 0.45);
  const flags = Array.isArray(payload.flags) ? payload.flags.map(String) : [];
  const reasonCodes = Array.isArray(payload.reasonCodes) ? payload.reasonCodes.map(String) : [];
  const patchType = (payload.patchType as "APPLY_WITNESS_READING" | "REPLACE_VERSE_TEXT" | "MANUAL_TEXT_EDIT") ?? "APPLY_WITNESS_READING";

  if (!selectedSource || !selectedTextSurface) {
    return NextResponse.json({ error: "selectedSource and selectedTextSurface are required." }, { status: 400 });
  }

  const working = repo.upsertWorkingVerseText({
    verseId,
    selectedSource,
    selectedTextNormalized,
    selectedTextSurface,
    ensembleConfidence,
    flags,
    reasonCodes,
  });

  const patch = repo.addBaseTextPatch({
    verseId,
    patchType,
    payload: {
      selectedSource,
      selectedTextNormalized,
      selectedTextSurface,
      ensembleConfidence,
      flags,
      reasonCodes,
    },
    author: username,
    note: payload.note ? String(payload.note) : undefined,
  });

  return NextResponse.json({ ok: true, working, patch });
}
