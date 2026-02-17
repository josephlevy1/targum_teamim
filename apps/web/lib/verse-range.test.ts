import { describe, expect, it } from "vitest";
import { parseVerseRange } from "./verse-range";

function params(value?: string): URLSearchParams {
  const out = new URLSearchParams();
  if (value !== undefined) {
    out.set("range", value);
  }
  return out;
}

describe("parseVerseRange", () => {
  it("accepts valid range", () => {
    const parsed = parseVerseRange(params("Genesis:1:1-Genesis:1:3"));
    expect(parsed).toEqual({
      ok: true,
      range: {
        start: "Genesis:1:1",
        end: "Genesis:1:3",
      },
    });
  });

  it("accepts missing range", () => {
    const parsed = parseVerseRange(params());
    expect(parsed).toEqual({
      ok: true,
      range: {},
    });
  });

  it("rejects malformed verse IDs", () => {
    const parsed = parseVerseRange(params("Genesis:x:1-Genesis:1:2"));
    expect(parsed.ok).toBe(false);
  });

  it("rejects inverted ranges", () => {
    const parsed = parseVerseRange(params("Genesis:2:1-Genesis:1:1"));
    expect(parsed.ok).toBe(false);
  });
});
