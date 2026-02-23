import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const repo = getRepository();
  const consensus = repo.getWorkingTaamConsensus(verseId);
  return NextResponse.json({ verseId, consensus });
}
