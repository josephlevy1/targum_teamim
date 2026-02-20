import { NextResponse } from "next/server";
import { readBookSources } from "@/lib/book-sources";

export async function GET() {
  const sources = readBookSources();
  return NextResponse.json({
    sources,
  });
}
