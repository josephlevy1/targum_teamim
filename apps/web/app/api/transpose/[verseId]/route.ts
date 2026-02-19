import { NextResponse } from "next/server";
import { generateForVerse } from "@targum/core";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { loadTransposeConfig } from "@/lib/config";
import { getRepository } from "@/lib/repository";

export async function POST(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  try {
    await requireEditorUser();
    const { verseId } = await ctx.params;
    const repo = getRepository();
    const record = repo.getVerseRecord(verseId as any);
    if (!record) {
      return NextResponse.json({ error: "Verse not found" }, { status: 404 });
    }

    const generated = generateForVerse(record.verse, loadTransposeConfig());
    repo.saveGenerated(record.verse.id, generated);

    return NextResponse.json({ generatedCount: generated.length });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }
    const message = error instanceof Error ? error.message : "Transpose failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
