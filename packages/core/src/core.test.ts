import { describe, expect, it } from "vitest";
import {
  MANUSCRIPT_NORMALIZATION_FORM,
  MANUSCRIPT_WITNESS_IDS,
  applyPatchLog,
  isCanonicalVerseId,
  parseCanonicalVerseId,
  parseVerse,
  transposeTaamim,
} from "./index.js";

const taamMap = {
  "\u0591": { name: "ETNACHTA", unicodeMark: "\u0591", tier: "DISJUNCTIVE" as const },
  "\u0596": { name: "TIPEHA", unicodeMark: "\u0596", tier: "CONJUNCTIVE" as const },
  "\u05C3": { name: "SOF_PASUK", unicodeMark: "\u05C3", tier: "PISUQ" as const },
};

const config = {
  disjunctiveBoundaries: ["ETNACHTA"],
  taamPrecedence: ["TIPEHA", "ETNACHTA", "SOF_PASUK"],
  sofPasukName: "SOF_PASUK",
};

describe("core parser and transposer", () => {
  it("parses taamim from mixed combining marks", () => {
    const verse = parseVerse("Genesis:1:1", "בְּרֵאשִׁ֖ית בָּרָ֣א׃", "בְּקַדְמִין בְּרָא", taamMap);
    const taamCount = verse.hebrewTokens.flatMap((t) => t.letters.flatMap((l) => l.taamim)).length;
    expect(taamCount).toBeGreaterThan(0);
  });

  it("keeps generated taam order equal to Hebrew event order", () => {
    const verse = parseVerse("Genesis:1:1", "א֑ ב֖ ג׃", "א ב ג", taamMap);
    const generated = transposeTaamim(verse.hebrewTokens, verse.aramaicTokens, config);
    expect(generated.map((t) => t.name)).toEqual(["ETNACHTA", "TIPEHA", "SOF_PASUK"]);
    expect(generated.at(-1)?.position.tokenIndex).toBe(2);
  });

  it("applies patch log deterministically", () => {
    const generated = [
      {
        taamId: "t1",
        name: "TIPEHA",
        unicodeMark: "\u0596",
        tier: "CONJUNCTIVE" as const,
        position: { tokenIndex: 0, letterIndex: 0 },
        confidence: 0.9,
        reasons: [],
      },
    ];

    const patches = [
      {
        id: "p1",
        verseId: "Genesis:1:1",
        author: "tester",
        createdAt: new Date().toISOString(),
        seqNo: 1,
        op: { type: "MOVE_TAAM", taamId: "t1", from: { tokenIndex: 0, letterIndex: 0 }, to: { tokenIndex: 1, letterIndex: 0 } } as const,
      },
    ];

    const editedA = applyPatchLog(generated, patches as any, 1);
    const editedB = applyPatchLog(generated, patches as any, 1);
    expect(editedA).toEqual(editedB);
    expect(editedA[0].position.tokenIndex).toBe(1);
  });

  it("does not crash when Hebrew disjunctive segmentation exceeds Aramaic token count", () => {
    const verse = parseVerse("Genesis:1:1", "א֑ ב֑ ג֑ ד׃", "א", taamMap);
    const generated = transposeTaamim(verse.hebrewTokens, verse.aramaicTokens, config);
    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((item) => item.position.tokenIndex === 0)).toBe(true);
  });

  it("defines manuscript constants and verse id parsing", () => {
    expect(MANUSCRIPT_NORMALIZATION_FORM).toBe("NFC");
    expect(MANUSCRIPT_WITNESS_IDS.vaticanMs448).toBe("vatican_ms_448");
    expect(isCanonicalVerseId("Genesis:1:1")).toBe(true);
    expect(isCanonicalVerseId("Genesis:0:1")).toBe(false);
    expect(parseCanonicalVerseId("Genesis:2:3")).toBe("Genesis:2:3");
    expect(() => parseCanonicalVerseId("bad-value")).toThrowError(/Invalid verse_id/);
  });
});
