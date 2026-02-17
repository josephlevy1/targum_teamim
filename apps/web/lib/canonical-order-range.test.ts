import { describe, expect, it } from "vitest";
import { compareVerseIdsCanonical, isVerseIdInRange } from "@targum/core";

describe("canonical verse ordering", () => {
  it("orders Torah books canonically", () => {
    const ids = [
      "Deuteronomy:34:12",
      "Genesis:1:1",
      "Exodus:1:1",
      "Numbers:1:1",
      "Leviticus:1:1",
    ];
    const sorted = [...ids].sort(compareVerseIdsCanonical);
    expect(sorted).toEqual([
      "Genesis:1:1",
      "Exodus:1:1",
      "Leviticus:1:1",
      "Numbers:1:1",
      "Deuteronomy:34:12",
    ]);
  });

  it("supports inclusive cross-book ranges", () => {
    expect(isVerseIdInRange("Genesis:1:1", "Genesis:1:1", "Exodus:1:1")).toBe(true);
    expect(isVerseIdInRange("Exodus:1:1", "Genesis:1:1", "Exodus:1:1")).toBe(true);
    expect(isVerseIdInRange("Leviticus:1:1", "Genesis:1:1", "Exodus:1:1")).toBe(false);
  });
});
