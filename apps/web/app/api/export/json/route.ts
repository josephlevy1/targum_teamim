import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

function parseRange(searchParams: URLSearchParams): { start?: any; end?: any } {
  const raw = searchParams.get("range");
  if (!raw) return {};
  const [start, end] = raw.split("-");
  return { start: start as any, end: (end || start) as any };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = getRepository().exportJson(parseRange(searchParams));
  return NextResponse.json({ data });
}
