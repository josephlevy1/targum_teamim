import { describe, expect, it } from "vitest";
import { enrichWitnessArtifacts, sortWitnessRows } from "./manuscripts-witness-payload";

describe("manuscripts witness payload helpers", () => {
  it("sorts witnesses by confidence then match", () => {
    const rows = [
      { witnessId: "w1", sourceConfidence: 0.8, matchScore: 0.9 },
      { witnessId: "w2", sourceConfidence: 0.9, matchScore: 0.1 },
      { witnessId: "w3", sourceConfidence: 0.8, matchScore: 0.95 },
    ];
    const sorted = sortWitnessRows(rows);
    expect(sorted.map((row) => row.witnessId)).toEqual(["w2", "w3", "w1"]);
  });

  it("fills artifact defaults while preserving existing keys", () => {
    const rows = [
      {
        witnessId: "w1",
        sourceConfidence: 0.7,
        matchScore: 0.7,
        artifacts: {
          tokenStats: { matches: 1 },
          custom: "keep",
        },
      },
      { witnessId: "w2", sourceConfidence: 0.4, matchScore: 0.5 },
    ];
    const enriched = enrichWitnessArtifacts(rows);
    expect(enriched[0].artifacts.custom).toBe("keep");
    expect(enriched[0].artifacts.tokenStats).toBeTruthy();
    expect(enriched[0].artifacts.charStats).toBeNull();
    expect(enriched[0].artifacts.replaceDetails).toEqual({});
    expect(enriched[1].artifacts.tokenStats).toBeNull();
    expect(enriched[1].artifacts.charStats).toBeNull();
    expect(enriched[1].artifacts.replaceDetails).toEqual({});
  });
});
