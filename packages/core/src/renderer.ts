import type { GeneratedTaam, Token, TransposeConfig, Verse } from "./types.js";
import { applyPatchLog } from "./patches.js";

function taamSortIndex(name: string, config: TransposeConfig): number {
  const idx = config.taamPrecedence.indexOf(name);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function renderToken(token: Token, taamimForToken: GeneratedTaam[], config: TransposeConfig): string {
  const taamByLetter = new Map<number, GeneratedTaam[]>();
  for (const taam of taamimForToken) {
    const slot = taamByLetter.get(taam.position.letterIndex) ?? [];
    slot.push(taam);
    taamByLetter.set(taam.position.letterIndex, slot);
  }

  return token.letters
    .map((letter, letterIdx) => {
      const niqqud = [...letter.niqqud].sort((a, b) => a.localeCompare(b, "he"));
      const taamMarks = (taamByLetter.get(letterIdx) ?? [])
        .sort((a, b) => taamSortIndex(a.name, config) - taamSortIndex(b.name, config))
        .map((t) => t.unicodeMark);

      return `${letter.baseChar}${niqqud.join("")}${taamMarks.join("")}`;
    })
    .join("");
}

export function renderVerseUnicode(
  verse: Verse,
  generated: GeneratedTaam[],
  patches: { op: any; seqNo: number }[],
  patchCursor: number,
  config: TransposeConfig,
  layer: "generated" | "edited",
): string {
  const active =
    layer === "generated"
      ? generated
      : applyPatchLog(generated, patches as any, patchCursor);

  const taamByToken = new Map<number, GeneratedTaam[]>();
  for (const taam of active) {
    const slot = taamByToken.get(taam.position.tokenIndex) ?? [];
    slot.push(taam);
    taamByToken.set(taam.position.tokenIndex, slot);
  }

  const renderedAramaic = verse.aramaicTokens
    .map((token, idx) => renderToken(token, taamByToken.get(idx) ?? [], config))
    .join(" ");

  const renderedHebrew = verse.hebrewTokens
    .map((token) =>
      token.letters.map((letter) => `${letter.baseChar}${letter.niqqud.join("")}${letter.taamim.map((t) => t.unicodeMark).join("")}`).join(""),
    )
    .join(" ");

  return `${renderedHebrew}\n${renderedAramaic}`;
}
