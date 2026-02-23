import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() as "queued" | "running" | "completed" | "failed" | null;
  const limit = Math.max(1, Math.min(500, Number(searchParams.get("limit") ?? 200)));
  const repo = getRepository();
  const ocr = repo.listOcrJobs(status ?? undefined).slice(0, limit);
  const taam = repo.listTaamAlignmentJobs(status ?? undefined).slice(0, limit);
  return NextResponse.json({ ocr, taam });
}
