import { NextResponse } from "next/server";
import { applyPatchLog } from "@targum/core";
import { isCloudDeployment } from "@/lib/cloud-runtime";
import { getPostgresReadingRepository } from "@/lib/postgres-reader";
import { getRepository } from "@/lib/repository";

export async function GET() {
  const cloud = isCloudDeployment();
  const cloudRepo = cloud ? getPostgresReadingRepository() : null;
  const localRepo = cloud ? null : getRepository();
  const verseIds = cloudRepo ? await cloudRepo.listVerseIds() : localRepo!.listVerseIds();
  const records = cloudRepo
    ? await Promise.all(verseIds.map((id) => cloudRepo.getVerseRecord(id)))
    : verseIds.map((id) => localRepo!.getVerseRecord(id));
  const items = records
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
