import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function POST(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const cursor = getRepository().redo(verseId as any);
  return NextResponse.json({ patchCursor: cursor });
}
