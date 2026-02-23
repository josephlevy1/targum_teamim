import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const repo = getRepository();
  const rows = repo.listWitnessTaamAlignmentsForVerse(verseId, "working_text");
  return NextResponse.json({ verseId, rows });
}
