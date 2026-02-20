import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const repo = getRepository();
  const record = repo.getVerseRecord(verseId as any);
  if (!record) {
    return NextResponse.json({ error: "Verse not found." }, { status: 404 });
  }

  const text = record.verse.aramaicTokens
    .map((token) => token.letters.map((letter) => `${letter.baseChar}${letter.niqqud.join("")}`).join(""))
    .join(" ");

  return NextResponse.json({ verseId, baselineText: text });
}
