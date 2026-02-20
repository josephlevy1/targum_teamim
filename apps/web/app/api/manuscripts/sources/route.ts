import { NextResponse } from "next/server";
import { readBookSources } from "@/lib/book-sources";
import { getSourceGateSnapshot } from "@/lib/manuscripts-gating";

export async function GET() {
  const sources = readBookSources();
  const gating = getSourceGateSnapshot();
  return NextResponse.json({
    sources,
    gating,
  });
}
