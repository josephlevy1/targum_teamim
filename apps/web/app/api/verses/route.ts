import { NextResponse } from "next/server";
import { applyPatchLog } from "@targum/core";
import { getRepository } from "@/lib/repository";

export async function GET() {
  const repo = getRepository();
  const verseIds = repo.listVerseIds();
  const items = verseIds
    .map((id) => repo.getVerseRecord(id))
    .filter(Boolean)
    .map((record) => {
      const r = record!;
      const edited = applyPatchLog(r.generated, r.patches, r.state.patchCursor);
      const avgConfidence =
        edited.length === 0 ? 0 : edited.reduce((acc, t) => acc + t.confidence, 0) / edited.length;
      return {
        verseId: r.verse.id,
        verified: r.state.verified,
        flagged: r.state.flagged,
        patchCursor: r.state.patchCursor,
        patchCount: r.patches.length,
        avgConfidence,
      };
    });

  return NextResponse.json({ items });
}
