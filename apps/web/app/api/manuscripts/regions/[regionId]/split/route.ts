import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { splitRegionIntoWitnessVerses } from "@/lib/manuscripts-pipeline";

export async function POST(_: Request, ctx: { params: Promise<{ regionId: string }> }) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { regionId } = await ctx.params;
  try {
    const result = splitRegionIntoWitnessVerses(regionId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Split failed." }, { status: 400 });
  }
}
