import { NextResponse } from "next/server";
import { renderVerseUnicode } from "@targum/core";
import { loadTransposeConfig } from "@/lib/config";
import { getRepository } from "@/lib/repository";
import { parseVerseRange } from "@/lib/verse-range";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedRange = parseVerseRange(searchParams);
  if (!parsedRange.ok) {
    return NextResponse.json({ error: parsedRange.error }, { status: 400 });
  }

  const config = loadTransposeConfig();
  const text = getRepository().exportUnicode(
    (record) => renderVerseUnicode(record.verse, record.generated, record.patches, record.state.patchCursor, config, "edited"),
    parsedRange.range,
  );

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
