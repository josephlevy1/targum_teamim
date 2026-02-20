import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";

export async function DELETE(_: Request, ctx: { params: Promise<{ regionId: string }> }) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { regionId } = await ctx.params;
  const repo = getRepository();
  repo.deletePageRegion(regionId);
  return NextResponse.json({ ok: true });
}
