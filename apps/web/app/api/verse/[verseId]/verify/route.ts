import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function POST(request: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const body = (await request.json()) as { verified?: boolean; manuscriptNotes?: string };
  const repo = getRepository();
  const existing = repo.getVerseRecord(verseId as any);
  if (!existing) {
    return NextResponse.json({ error: "Verse not found" }, { status: 404 });
  }
  const notes = body.manuscriptNotes ?? existing?.state.manuscriptNotes ?? "";
  repo.setVerification(verseId as any, Boolean(body.verified), notes);
  return NextResponse.json({ ok: true });
}
