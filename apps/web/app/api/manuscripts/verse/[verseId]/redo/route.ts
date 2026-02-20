import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";

export async function POST(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { verseId } = await ctx.params;
  const repo = getRepository();
  const patchCursor = repo.redoBaseText(verseId);
  return NextResponse.json({ ok: true, verseId, patchCursor, working: repo.getWorkingVerseText(verseId) });
}
