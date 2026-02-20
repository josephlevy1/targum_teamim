import { describe, expect, it } from "vitest";
import { alignWitnessToBaseline } from "./manuscripts-pipeline";

describe("manuscripts pipeline alignment", () => {
  it("computes edit distance and match score", () => {
    const result = alignWitnessToBaseline("abc def", "abc xyz");
    expect(result.editDistance).toBeGreaterThan(0);
    expect(result.matchScore).toBeGreaterThanOrEqual(0);
    expect(result.matchScore).toBeLessThan(1);
    expect(result.tokenDiffOps.length).toBeGreaterThan(0);
  });
});
