import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const witnessId = searchParams.get("witnessId")?.trim() ?? "";
  if (!witnessId) {
    return NextResponse.json({ error: "witnessId is required." }, { status: 400 });
  }

  const repo = getRepository();
  return NextResponse.json({
    witnessId,
    progress: repo.getWitnessProgress(witnessId),
  });
}
