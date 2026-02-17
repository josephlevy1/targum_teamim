import { NextResponse } from "next/server";
import { applyPatchLog, parseVerseId } from "@targum/core";
import { getRepository } from "@/lib/repository";

type ReadingVerse = {
  verseId: string;
  verseNumber: number;
  hebrewText: string;
  aramaicText: string;
  verified: boolean;
  flagged: boolean;
};

function renderHebrewText(record: ReturnType<ReturnType<typeof getRepository>["getVerseRecord"]>): string {
  if (!record) return "";
  return record.verse.hebrewTokens
    .map((token) =>
      token.letters.map((letter) => `${letter.baseChar}${letter.niqqud.join("")}${letter.taamim.map((t) => t.unicodeMark).join("")}`).join(""),
    )
    .join(" ");
}

function renderAramaicText(record: ReturnType<ReturnType<typeof getRepository>["getVerseRecord"]>): string {
  if (!record) return "";

  const edited = applyPatchLog(record.generated, record.patches, record.state.patchCursor);
  const taamByToken = new Map<number, typeof edited>();
  for (const taam of edited) {
    const slot = taamByToken.get(taam.position.tokenIndex) ?? [];
    slot.push(taam);
    taamByToken.set(taam.position.tokenIndex, slot);
  }

  return record.verse.aramaicTokens
    .map((token, tokenIdx) => {
      const byLetter = new Map<number, string[]>();
      for (const taam of taamByToken.get(tokenIdx) ?? []) {
        const slot = byLetter.get(taam.position.letterIndex) ?? [];
        slot.push(taam.unicodeMark);
        byLetter.set(taam.position.letterIndex, slot);
      }
      return token.letters
        .map((letter, letterIdx) => `${letter.baseChar}${letter.niqqud.join("")}${(byLetter.get(letterIdx) ?? []).join("")}`)
        .join("");
    })
    .join(" ");
}

export async function GET(request: Request) {
  const repo = getRepository();
  const ids = repo.listVerseIds();
  if (ids.length === 0) {
    return NextResponse.json({
      selectedBook: "",
      selectedChapter: 0,
      books: [],
      chapters: [],
      verses: [] satisfies ReadingVerse[],
    });
  }

  const parsed = ids.map((id) => ({ id, ...parseVerseId(id) }));
  const books = Array.from(new Set(parsed.map((p) => p.book)));

  const { searchParams } = new URL(request.url);
  const requestedBook = searchParams.get("book")?.trim() ?? "";
  const requestedChapter = Number(searchParams.get("chapter"));

  const selectedBook = books.includes(requestedBook) ? requestedBook : books[0];
  const chapters = Array.from(new Set(parsed.filter((p) => p.book === selectedBook).map((p) => p.chapter))).sort((a, b) => a - b);
  const selectedChapter = Number.isInteger(requestedChapter) && chapters.includes(requestedChapter) ? requestedChapter : chapters[0];

  if (!selectedBook || !selectedChapter) {
    return NextResponse.json({ error: "Book or chapter not found." }, { status: 404 });
  }

  const verses: ReadingVerse[] = parsed
    .filter((item) => item.book === selectedBook && item.chapter === selectedChapter)
    .sort((a, b) => a.verse - b.verse)
    .map((item) => repo.getVerseRecord(item.id))
    .filter((record): record is NonNullable<typeof record> => Boolean(record))
    .map((record) => ({
      verseId: record.verse.id,
      verseNumber: parseVerseId(record.verse.id).verse,
      hebrewText: renderHebrewText(record),
      aramaicText: renderAramaicText(record),
      verified: record.state.verified,
      flagged: record.state.flagged,
    }));

  return NextResponse.json({
    selectedBook,
    selectedChapter,
    books,
    chapters,
    verses,
  });
}
