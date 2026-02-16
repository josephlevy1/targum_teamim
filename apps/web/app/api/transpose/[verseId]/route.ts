import { NextResponse } from "next/server";
import { generateForVerse } from "@targum/core";
import { loadTransposeConfig } from "@/lib/config";
import { getRepository } from "@/lib/repository";

export async function POST(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const repo = getRepository();
  const record = repo.getVerseRecord(verseId as any);
  if (!record) {
    return NextResponse.json({ error: "Verse not found" }, { status: 404 });
  }

  const generated = generateForVerse(record.verse, loadTransposeConfig());
  repo.saveGenerated(record.verse.id, generated);

  return NextResponse.json({ generatedCount: generated.length });
}
