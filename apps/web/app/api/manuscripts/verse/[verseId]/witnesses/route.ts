import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

const cache = new Map<string, { ts: number; payload: unknown }>();
const CACHE_TTL_MS = 3_000;

export async function GET(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const now = Date.now();
  const cached = cache.get(verseId);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }
  const repo = getRepository();
  const witnesses = repo.listWitnessVersesForVerse(verseId);
  const working = repo.getWorkingVerseText(verseId);
  const payload = { verseId, witnesses, working };
  cache.set(verseId, { ts: now, payload });
  return NextResponse.json(payload);
}
