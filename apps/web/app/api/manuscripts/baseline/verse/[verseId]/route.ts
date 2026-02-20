import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

const cache = new Map<string, { ts: number; payload: { verseId: string; baselineText: string } }>();
const CACHE_TTL_MS = 10_000;

export async function GET(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const now = Date.now();
  const cached = cache.get(verseId);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  const repo = getRepository();
  const record = repo.getVerseRecord(verseId as any);
  if (!record) {
    return NextResponse.json({ error: "Verse not found." }, { status: 404 });
  }

  const text = record.verse.aramaicTokens
    .map((token) => token.letters.map((letter) => `${letter.baseChar}${letter.niqqud.join("")}`).join(""))
    .join(" ");

  const payload = { verseId, baselineText: text };
  cache.set(verseId, { ts: now, payload });
  return NextResponse.json(payload);
}
