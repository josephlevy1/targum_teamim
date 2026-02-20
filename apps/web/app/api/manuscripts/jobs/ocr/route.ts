import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() || undefined;
  const repo = getRepository();
  return NextResponse.json({ jobs: repo.listOcrJobs(status) });
}
