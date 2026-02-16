import { NextResponse } from "next/server";
import { importHebrewLines, parseTsvLines } from "@/lib/import";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { content?: string };
    if (!body.content) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    const count = importHebrewLines(parseTsvLines(body.content));
    return NextResponse.json({ imported: count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
