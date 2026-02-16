import { NextResponse } from "next/server";
import { importTargumLines, parseTsvLines } from "@/lib/import";

export async function POST(request: Request) {
  const body = (await request.json()) as { content?: string };
  if (!body.content) {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }

  const count = importTargumLines(parseTsvLines(body.content));
  return NextResponse.json({ imported: count });
}
