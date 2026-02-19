import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";

export async function POST(request: Request, ctx: { params: Promise<{ verseId: string }> }) {
  try {
    await requireEditorUser();
    const { verseId } = await ctx.params;
    const body = (await request.json()) as { flagged?: boolean };
    const repo = getRepository();
    if (!repo.getVerseRecord(verseId as any)) {
      return NextResponse.json({ error: "Verse not found" }, { status: 404 });
    }
    repo.setFlagged(verseId as any, Boolean(body.flagged));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }
    const message = error instanceof Error ? error.message : "Failed to save flag.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
