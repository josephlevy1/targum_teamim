import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";

export async function POST(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  try {
    await requireEditorUser();
    const { verseId } = await ctx.params;
    const repo = getRepository();
    if (!repo.getVerseRecord(verseId as any)) {
      return NextResponse.json({ error: "Verse not found" }, { status: 404 });
    }
    const cursor = repo.redo(verseId as any);
    return NextResponse.json({ patchCursor: cursor });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }
    const message = error instanceof Error ? error.message : "Failed to redo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
