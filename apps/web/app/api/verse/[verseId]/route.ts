import { NextResponse } from "next/server";
import { applyPatchLog } from "@targum/core";
import { isCloudDeployment } from "@/lib/cloud-runtime";
import { getPostgresReadingRepository } from "@/lib/postgres-reader";
import { getRepository } from "@/lib/repository";

export async function GET(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const record = isCloudDeployment()
    ? await getPostgresReadingRepository().getVerseRecord(verseId as any)
    : getRepository().getVerseRecord(verseId as any);
  if (!record) {
    return NextResponse.json({ error: "Verse not found" }, { status: 404 });
  }

  const edited = applyPatchLog(record.generated, record.patches, record.state.patchCursor);
  return NextResponse.json({ ...record, edited });
}
