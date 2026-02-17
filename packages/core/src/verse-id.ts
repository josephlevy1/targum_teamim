import type { VerseId } from "./types.js";

export const TORAH_BOOK_ORDER = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"] as const;
const TORAH_BOOK_INDEX = new Map<string, number>(TORAH_BOOK_ORDER.map((name, idx) => [name, idx]));

export interface ParsedVerseId {
  book: string;
  chapter: number;
  verse: number;
}

export function parseVerseId(verseId: VerseId | string): ParsedVerseId {
  const [book, chapter, verse] = verseId.split(":");
  return {
    book: book ?? "",
    chapter: Number(chapter ?? NaN),
    verse: Number(verse ?? NaN),
  };
}

export function compareVerseIdsCanonical(a: VerseId | string, b: VerseId | string): number {
  const left = parseVerseId(a);
  const right = parseVerseId(b);

  const leftTorahIdx = TORAH_BOOK_INDEX.get(left.book);
  const rightTorahIdx = TORAH_BOOK_INDEX.get(right.book);

  if (leftTorahIdx !== undefined && rightTorahIdx !== undefined && leftTorahIdx !== rightTorahIdx) {
    return leftTorahIdx - rightTorahIdx;
  }

  if (left.book !== right.book) {
    return left.book.localeCompare(right.book);
  }

  if (left.chapter !== right.chapter) {
    return left.chapter - right.chapter;
  }

  return left.verse - right.verse;
}

export function isVerseIdInRange(verseId: VerseId | string, start?: VerseId | string, end?: VerseId | string): boolean {
  if (start && compareVerseIdsCanonical(verseId, start) < 0) {
    return false;
  }
  if (end && compareVerseIdsCanonical(verseId, end) > 0) {
    return false;
  }
  return true;
}
