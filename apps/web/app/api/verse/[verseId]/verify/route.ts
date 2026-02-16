import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function POST(request: Request, ctx: { params: Promise<{ verseId: string }> }) {
  const { verseId } = await ctx.params;
  const body = (await request.json()) as { verified?: boolean; manuscriptNotes?: string };
  getRepository().setVerification(verseId as any, Boolean(body.verified), body.manuscriptNotes ?? "");
  return NextResponse.json({ ok: true });
}
