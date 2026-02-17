export type VerseRef = {
  id: string;
  book: string;
  chapter: number;
  verse: number;
};

export type ExportRange = {
  start: string;
  end: string;
};

export function sanitizeFileNamePart(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

export function verseRange(selectedVerseId: string): ExportRange | null {
  const id = selectedVerseId.trim();
  if (!id) return null;
  return { start: id, end: id };
}

export function chapterRange(sortedVerseRefs: VerseRef[], book: string, chapter: number): ExportRange | null {
  const inScope = sortedVerseRefs.filter((ref) => ref.book === book && ref.chapter === chapter);
  if (inScope.length === 0) return null;
  return { start: inScope[0].id, end: inScope[inScope.length - 1].id };
}

export function bookRange(sortedVerseRefs: VerseRef[], book: string): ExportRange | null {
  const inScope = sortedVerseRefs.filter((ref) => ref.book === book);
  if (inScope.length === 0) return null;
  return { start: inScope[0].id, end: inScope[inScope.length - 1].id };
}
