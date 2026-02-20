import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/repository";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";

const positionSchema = z.object({ tokenIndex: z.number().int().nonnegative(), letterIndex: z.number().int().nonnegative() });
const generatedSchema = z.object({
  taamId: z.string(),
  name: z.string(),
  unicodeMark: z.string(),
  tier: z.enum(["DISJUNCTIVE", "CONJUNCTIVE", "METEG_LIKE", "PISUQ"]),
  position: positionSchema,
  confidence: z.number(),
  reasons: z.array(z.string()),
});

const patchSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MOVE_TAAM"), taamId: z.string(), from: positionSchema, to: positionSchema }),
  z.object({
    type: z.literal("SWAP_TAAM"),
    taamId: z.string(),
    oldName: z.string(),
    newName: z.string(),
    newUnicodeMark: z.string(),
    newTier: z.enum(["DISJUNCTIVE", "CONJUNCTIVE", "METEG_LIKE", "PISUQ"]),
  }),
  z.object({ type: z.literal("DELETE_TAAM"), taamId: z.string() }),
  z.object({ type: z.literal("INSERT_TAAM"), taam: generatedSchema }),
]);

export async function POST(request: Request, ctx: { params: Promise<{ verseId: string }> }) {
  try {
    const user = await requireEditorUser();
    const { verseId } = await ctx.params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body.op);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid patch operation", details: parsed.error.flatten() }, { status: 400 });
    }

    const note = typeof body.note === "string" ? body.note : undefined;
    const sourceType =
      body.sourceType === "import" || body.sourceType === "automation" || body.sourceType === "manual"
        ? body.sourceType
        : "manual";
    const sourceWitnessId =
      typeof body.sourceWitnessId === "string" && body.sourceWitnessId.trim() ? body.sourceWitnessId.trim() : null;
    const repo = getRepository();
    const entry = repo.addPatch(verseId as any, parsed.data as any, note, user.username, {
      sourceType,
      sourceWitnessId,
    });
    return NextResponse.json(entry);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }
    const message = error instanceof Error ? error.message : "Failed to apply patch.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
