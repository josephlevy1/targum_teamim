import { describe, expect, it } from "vitest";
import { bookRange, chapterRange, sanitizeFileNamePart, verseRange, type VerseRef } from "./export-ranges";

const refs: VerseRef[] = [
  { id: "Genesis:1:1", book: "Genesis", chapter: 1, verse: 1 },
  { id: "Genesis:1:2", book: "Genesis", chapter: 1, verse: 2 },
  { id: "Genesis:2:1", book: "Genesis", chapter: 2, verse: 1 },
  { id: "Exodus:1:1", book: "Exodus", chapter: 1, verse: 1 },
];

describe("export ranges", () => {
  it("returns verse range from the selected verse ID", () => {
    expect(verseRange("Genesis:1:2")).toEqual({ start: "Genesis:1:2", end: "Genesis:1:2" });
  });

  it("returns chapter range for first and last verse in chapter", () => {
    expect(chapterRange(refs, "Genesis", 1)).toEqual({ start: "Genesis:1:1", end: "Genesis:1:2" });
  });

  it("returns book range for first and last verse in book", () => {
    expect(bookRange(refs, "Genesis")).toEqual({ start: "Genesis:1:1", end: "Genesis:2:1" });
  });

  it("returns null when scope is empty", () => {
    expect(verseRange("")).toBeNull();
    expect(chapterRange(refs, "Genesis", 9)).toBeNull();
    expect(bookRange(refs, "Leviticus")).toBeNull();
  });

  it("sanitizes filename parts", () => {
    expect(sanitizeFileNamePart("Song of Songs")).toBe("Song_of_Songs");
    expect(sanitizeFileNamePart("  ")).toBe("unknown");
  });
});
