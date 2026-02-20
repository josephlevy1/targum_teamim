import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { recomputeCascadeForVerse } from "@/lib/manuscripts-pipeline";
import { evaluateSourceGate } from "@/lib/manuscripts-gating";

export async function POST(request: Request) {
  let username = "local-user";
  try {
    const user = await requireEditorUser();
    username = user.username;
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const verseId = String(payload.verseId ?? "").trim();
  const witnessId = String(payload.witnessId ?? "").trim();
  const adminOverride = Boolean(payload.adminOverride);
  if (!verseId) {
    return NextResponse.json({ error: "verseId is required." }, { status: 400 });
  }

  try {
    if (witnessId) {
      const gate = evaluateSourceGate({ witnessId, stage: "confidence", adminOverride, actor: username });
      if (!gate.allowed) {
        return NextResponse.json({ error: "Priority gate blocked cascade run.", blockers: gate.blockers }, { status: 409 });
      }
    }
    const result = recomputeCascadeForVerse(verseId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cascade recompute failed." }, { status: 400 });
  }
}
