import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";
import { parseVerseRange } from "@/lib/verse-range";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedRange = parseVerseRange(searchParams);
  if (!parsedRange.ok) {
    return NextResponse.json({ error: parsedRange.error }, { status: 400 });
  }

  const data = getRepository().exportJson(parsedRange.range);
  return NextResponse.json({ data });
}
