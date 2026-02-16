import type { GeneratedTaam, PatchEntry, Token, TransposeConfig, Verse, VerseId, VerseState } from "./types.js";
import { parseVerseLineToTokens, type TaamMap } from "./parser.js";
import { applyPatchLog } from "./patches.js";
import { transposeTaamim } from "./transpose.js";

export interface VerseBundle {
  verse: Verse;
  generated: GeneratedTaam[];
  patches: PatchEntry[];
  state: VerseState;
}

export function parseVerse(
  verseId: VerseId,
  hebrewLine: string,
  aramaicLine: string,
  taamMap: TaamMap,
): Verse {
  const hebrewTokens = parseVerseLineToTokens(verseId, hebrewLine, taamMap, "he");
  const aramaicTokens = parseVerseLineToTokens(verseId, aramaicLine, taamMap, "ar");
  return {
    id: verseId,
    hebrewTokens,
    aramaicTokens,
  };
}

export function generateForVerse(verse: Verse, config: TransposeConfig): GeneratedTaam[] {
  return transposeTaamim(verse.hebrewTokens, verse.aramaicTokens, config);
}

export function materializeEditedTaamim(bundle: VerseBundle): GeneratedTaam[] {
  return applyPatchLog(bundle.generated, bundle.patches, bundle.state.patchCursor);
}

export function taamimByToken(taamim: GeneratedTaam[], tokenCount: number): GeneratedTaam[][] {
  const rows: GeneratedTaam[][] = Array.from({ length: tokenCount }, () => []);
  for (const taam of taamim) {
    const idx = taam.position.tokenIndex;
    if (rows[idx]) {
      rows[idx].push(taam);
    }
  }
  return rows;
}

export function tokenText(token: Token): string {
  return token.letters.map((letter) => `${letter.baseChar}${letter.niqqud.join("")}`).join("");
}
