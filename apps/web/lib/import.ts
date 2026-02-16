import { parseVerse, type VerseId } from "@targum/core";
import { getRepository } from "./repository";
import { loadTaamMap } from "./config";

export interface VerseLine {
  verseId: VerseId;
  text: string;
}

const VERSE_ID_RE = /^[^:\s]+:\d+:\d+$/;

function parseVerseLine(line: string, lineNo: number): VerseLine {
  const [rawVerseId, ...rest] = line.split("\t");
  const verseId = rawVerseId?.trim();
  if (!verseId || !VERSE_ID_RE.test(verseId)) {
    throw new Error(`Invalid verse ID on line ${lineNo}. Expected Book:Chapter:Verse (example: Genesis:1:1).`);
  }

  const text = rest.join("\t").trim();
  if (!text) {
    throw new Error(`Missing text on line ${lineNo}. TSV must be verse_id<TAB>text.`);
  }

  return {
    verseId: verseId as VerseId,
    text,
  };
}

export function parseTsvLines(content: string): VerseLine[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => parseVerseLine(line, idx + 1));
}

export function importHebrewLines(lines: VerseLine[]): number {
  const repo = getRepository();
  const taamMap = loadTaamMap();
  let count = 0;

  for (const line of lines) {
    const existing = repo.getVerseRecord(line.verseId);
    const aramaic = existing ? existing.verse.aramaicTokens.map((t) => t.surface).join(" ") : "";
    const verse = parseVerse(line.verseId, line.text, aramaic, taamMap);
    repo.upsertVerse(verse);
    count += 1;
  }

  return count;
}

export function importTargumLines(lines: VerseLine[]): number {
  const repo = getRepository();
  const taamMap = loadTaamMap();
  let count = 0;

  for (const line of lines) {
    const existing = repo.getVerseRecord(line.verseId);
    const hebrew = existing ? existing.verse.hebrewTokens.map((t) => t.surface).join(" ") : "";
    const verse = parseVerse(line.verseId, hebrew, line.text, taamMap);
    repo.upsertVerse(verse);
    count += 1;
  }

  return count;
}
