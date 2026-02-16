import { parseVerse, type VerseId } from "@targum/core";
import { getRepository } from "./repository";
import { loadTaamMap } from "./config";

export interface VerseLine {
  verseId: VerseId;
  text: string;
}

export function parseTsvLines(content: string): VerseLine[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [verseId, ...rest] = line.split("\t");
      return {
        verseId: verseId as VerseId,
        text: rest.join("\t").trim(),
      };
    });
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
