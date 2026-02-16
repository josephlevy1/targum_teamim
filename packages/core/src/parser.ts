import {
  type GeneratedTaam,
  type Letter,
  type Taam,
  type TaamTier,
  type Token,
  type VerseId,
} from "./types.js";
import { isHebrewLetter, isNiqqud, isTaam, normalizeNfd, SOF_PASUK, tokenizeWords } from "./unicode.js";

export interface TaamMapEntry {
  name: string;
  unicodeMark: string;
  tier: TaamTier;
}

export type TaamMap = Record<string, TaamMapEntry>;

function createId(prefix: string, ...parts: Array<string | number>): string {
  return `${prefix}_${parts.join("_")}`;
}

export function parseToken(surface: string, tokenId: string, taamMap: TaamMap): Token {
  const normalized = normalizeNfd(surface);
  const letters: Letter[] = [];
  let current: Letter | null = null;

  for (const ch of normalized) {
    if (isHebrewLetter(ch) || /[\u0600-\u06FF]/.test(ch)) {
      current = {
        letterId: createId("l", tokenId, letters.length),
        baseChar: ch,
        niqqud: [],
        taamim: [],
      };
      letters.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (isNiqqud(ch)) {
      current.niqqud.push(ch);
      continue;
    }

    if (isTaam(ch)) {
      const mapped = taamMap[ch] ?? {
        name: `U+${ch.codePointAt(0)?.toString(16).toUpperCase()}`,
        unicodeMark: ch,
        tier: "CONJUNCTIVE" as TaamTier,
      };
      current.taamim.push({
        taamId: createId("t", tokenId, current.letterId, current.taamim.length),
        name: mapped.name,
        unicodeMark: ch,
        tier: mapped.tier,
        position: {
          tokenId,
          letterId: current.letterId,
        },
      });
      continue;
    }

    if (ch === SOF_PASUK) {
      current.taamim.push({
        taamId: createId("t", tokenId, current.letterId, current.taamim.length),
        name: "SOF_PASUK",
        unicodeMark: ch,
        tier: "PISUQ",
        position: {
          tokenId,
          letterId: current.letterId,
        },
      });
    }
  }

  return {
    tokenId,
    surface: normalized,
    letters,
  };
}

export function parseVerseLineToTokens(
  verseId: VerseId,
  text: string,
  taamMap: TaamMap,
  tokenPrefix: "he" | "ar",
): Token[] {
  const words = tokenizeWords(text);
  return words.map((word, idx) => parseToken(word, createId(tokenPrefix, verseId, idx), taamMap));
}

export function cloneGenerated(generated: GeneratedTaam[]): GeneratedTaam[] {
  return generated.map((t) => ({
    ...t,
    position: { ...t.position },
    reasons: [...t.reasons],
  }));
}

export function clearTokenTaamim(tokens: Token[]): Token[] {
  return tokens.map((token) => ({
    ...token,
    letters: token.letters.map((letter) => ({
      ...letter,
      niqqud: [...letter.niqqud],
      taamim: [] as Taam[],
    })),
  }));
}
