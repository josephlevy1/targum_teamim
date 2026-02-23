import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";

export async function POST(_: Request, ctx: { params: Promise<{ verseId: string }> }) {
  let username = "local-user";
  try {
    const user = await requireEditorUser();
    username = user.username;
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { verseId } = await ctx.params;
  const repo = getRepository();
  const consensus = repo.getWorkingTaamConsensus(verseId);
  if (!consensus) {
    return NextResponse.json({ error: "Consensus not found." }, { status: 404 });
  }

  const patchIds: string[] = [];
  for (const mark of consensus.consensusTaam) {
    const patch = repo.addPatch(
      verseId as any,
      {
        type: "INSERT_TAAM",
        taam: {
          taamId: String(mark.taamId ?? randomUUID()),
          name: String(mark.name ?? "ConsensusMark"),
          unicodeMark: String(mark.unicodeMark ?? ""),
          tier: (mark.tier as any) ?? "CONJUNCTIVE",
          position: {
            tokenIndex: Number((mark.position as any)?.tokenIndex ?? 0),
            letterIndex: Number((mark.position as any)?.letterIndex ?? 0),
          },
          confidence: Number(mark.confidence ?? consensus.ensembleConfidence ?? 0.7),
          reasons: Array.isArray((mark as any).reasons) ? (mark as any).reasons.map(String) : ["consensus-apply"],
        },
      },
      "Applied OCR taam consensus",
      username,
      { sourceType: "import", sourceWitnessId: "consensus" },
    );
    patchIds.push(patch.id);
  }

  return NextResponse.json({ ok: true, verseId, patchIds, applied: patchIds.length });
}
