import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const repo = getRepository();
  return NextResponse.json({
    verseId,
    patches: repo.listBaseTextPatches(verseId),
    patchCursor: repo.getBaseTextPatchCursor(verseId),
  });
}
