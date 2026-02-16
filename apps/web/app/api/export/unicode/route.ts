import { NextResponse } from "next/server";
import { renderVerseUnicode } from "@targum/core";
import { loadTransposeConfig } from "@/lib/config";
import { getRepository } from "@/lib/repository";

function parseRange(searchParams: URLSearchParams): { start?: any; end?: any } {
  const raw = searchParams.get("range");
  if (!raw) return {};
  const [start, end] = raw.split("-");
  return { start: start as any, end: (end || start) as any };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const config = loadTransposeConfig();
  const text = getRepository().exportUnicode(
    (record) => renderVerseUnicode(record.verse, record.generated, record.patches, record.state.patchCursor, config, "edited"),
    parseRange(searchParams),
  );

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
