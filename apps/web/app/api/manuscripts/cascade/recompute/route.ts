import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { recomputeCascadeForVerse } from "@/lib/manuscripts-pipeline";

export async function POST(request: Request) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const verseId = String(payload.verseId ?? "").trim();
  if (!verseId) {
    return NextResponse.json({ error: "verseId is required." }, { status: 400 });
  }

  try {
    const result = recomputeCascadeForVerse(verseId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cascade recompute failed." }, { status: 400 });
  }
}
