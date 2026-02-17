import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function POST(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const repo = getRepository();
  if (!repo.getVerseRecord(verseId as any)) {
    return NextResponse.json({ error: "Verse not found" }, { status: 404 });
  }
  const cursor = repo.undo(verseId as any);
  return NextResponse.json({ patchCursor: cursor });
}
