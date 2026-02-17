import { compareVerseIdsCanonical, type VerseId } from "@targum/core";

const VERSE_ID_RE = /^[^:\s]+:\d+:\d+$/;

export type VerseRangeParseResult =
  | { ok: true; range: { start?: VerseId; end?: VerseId } }
  | { ok: false; error: string };

function isVerseId(value: string): value is VerseId {
  return VERSE_ID_RE.test(value);
}

export function parseVerseRange(searchParams: URLSearchParams): VerseRangeParseResult {
  const raw = searchParams.get("range");
  if (!raw) {
    return { ok: true, range: {} };
  }

  const parts = raw.split("-");
  if (parts.length !== 2) {
    return { ok: false, error: "Invalid range format. Expected start-end verse IDs." };
  }

  const start = parts[0]?.trim();
  const end = (parts[1] || parts[0])?.trim();

  if (!start || !end || !isVerseId(start) || !isVerseId(end)) {
    return { ok: false, error: "Invalid range value. Verse IDs must match Book:Chapter:Verse." };
  }

  if (compareVerseIdsCanonical(start, end) > 0) {
    return { ok: false, error: "Invalid range value. Start verse must be before or equal to end verse." };
  }

  return {
    ok: true,
    range: {
      start,
      end,
    },
  };
}
