import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function POST(request: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const body = (await request.json()) as { flagged?: boolean };
  const repo = getRepository();
  if (!repo.getVerseRecord(verseId as any)) {
    return NextResponse.json({ error: "Verse not found" }, { status: 404 });
  }
  repo.setFlagged(verseId as any, Boolean(body.flagged));
  return NextResponse.json({ ok: true });
}
