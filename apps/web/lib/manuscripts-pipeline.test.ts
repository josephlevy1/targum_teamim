import { describe, expect, it } from "vitest";
import { alignWitnessToBaseline, recomputeCascadeForVerse, recomputeSourceConfidence } from "./manuscripts-pipeline";
import { getRepository } from "./repository";

describe("manuscripts pipeline alignment", () => {
  it("computes token and char alignment with replace details", () => {
    const result = alignWitnessToBaseline("abc def ghi", "abc xyz");
    expect(result.editDistance).toBeGreaterThan(0);
    expect(result.matchScore).toBeGreaterThanOrEqual(0);
    expect(result.matchScore).toBeLessThan(1);
    expect(result.tokenDiffOps.length).toBeGreaterThan(0);
    expect(result.tokenStats.replacements).toBeGreaterThan(0);
    const replaceIndex = result.tokenDiffOps.findIndex((op) => op.op === "replace");
    expect(replaceIndex).toBeGreaterThanOrEqual(0);
    if (replaceIndex >= 0) {
      expect(result.replaceDetails[replaceIndex]).toBeTruthy();
      expect(result.replaceDetails[replaceIndex].charOps.length).toBeGreaterThan(0);
    }
    expect(result.charStats.charEditDistance).toBeGreaterThan(0);
  });

  it("normalizes whitespace in stable manner", () => {
    const result = alignWitnessToBaseline("אבג   דה", "אבג דה");
    expect(result.editDistance).toBe(0);
    expect(result.matchScore).toBe(1);
    expect(result.charStats.charEditDistance).toBe(0);
    expect(result.charStats.charMatchScore).toBe(1);
  });

  it("recomputeSourceConfidence preserves existing artifacts", () => {
    const repo = getRepository();
    const verseId = repo.listVerseIds()[0] as string;
    expect(verseId).toBeTruthy();
    const witnessId = "test_artifact_preserve";
    repo.upsertWitness({
      id: witnessId,
      name: "Artifact Preserve Witness",
      type: "scanned_images",
      authorityWeight: 0.7,
    });
    repo.upsertWitnessVerse({
      verseId,
      witnessId,
      textRaw: "abc",
      textNormalized: "abc",
      clarityScore: 0.7,
      matchScore: 0.8,
      completenessScore: 0.9,
      sourceConfidence: 0.1,
      status: "ok",
      artifacts: {
        tokenStats: { matches: 1, replacements: 0, inserts: 0, deletes: 0, alignedTokenCount: 1 },
        customField: "kept",
      },
    });
    recomputeSourceConfidence(verseId);
    const updated = repo.getWitnessVerse(verseId, witnessId);
    expect(updated?.artifacts).toBeTruthy();
    expect((updated?.artifacts as Record<string, unknown>).customField).toBe("kept");
  });

  it("flags disagreement when top witnesses diverge by char match", () => {
    const repo = getRepository();
    const verseId = (repo.listVerseIds()[1] ?? repo.listVerseIds()[0]) as string;
    expect(verseId).toBeTruthy();
    const witnessA = "test_top_a";
    const witnessB = "test_top_b";
    repo.upsertWitness({ id: witnessA, name: "Top A", type: "scanned_images", authorityWeight: 0.9 });
    repo.upsertWitness({ id: witnessB, name: "Top B", type: "scanned_images", authorityWeight: 0.85 });
    repo.upsertWitnessVerse({
      verseId,
      witnessId: witnessA,
      textRaw: "אבגד",
      textNormalized: "אבגד",
      clarityScore: 0.9,
      matchScore: 0.9,
      completenessScore: 0.9,
      sourceConfidence: 0.91,
      status: "ok",
      artifacts: {},
    });
    repo.upsertWitnessVerse({
      verseId,
      witnessId: witnessB,
      textRaw: "תשרק",
      textNormalized: "תשרק",
      clarityScore: 0.9,
      matchScore: 0.9,
      completenessScore: 0.9,
      sourceConfidence: 0.88,
      status: "ok",
      artifacts: {},
    });

    const result = recomputeCascadeForVerse(verseId);
    expect(result.selectedSource).toBe(witnessA);
    expect(result.flags).toContain("DISAGREEMENT_FLAG");
    expect(result.reasonCodes).toContain("HIGH_CONFIDENCE_DISAGREEMENT");
    expect(result.ensembleConfidence).toBeLessThanOrEqual(0.7);
  });
});
