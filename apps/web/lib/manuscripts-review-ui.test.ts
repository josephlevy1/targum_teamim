import { describe, expect, it } from "vitest";
import { sortAndFilterWitnesses } from "./manuscripts-review-ui";

describe("manuscripts review UI helpers", () => {
  const witnesses = [
    {
      witnessId: "w-a",
      sourceConfidence: 0.9,
      matchScore: 0.7,
      status: "ok",
      artifacts: { charStats: { charMatchScore: 0.62 } },
    },
    {
      witnessId: "w-b",
      sourceConfidence: 0.5,
      matchScore: 0.95,
      status: "partial",
      artifacts: { charStats: { charMatchScore: 0.95 } },
    },
    {
      witnessId: "w-c",
      sourceConfidence: 0.8,
      matchScore: 0.8,
      status: "unavailable",
      artifacts: { charStats: { charMatchScore: 0.78 } },
    },
  ];

  it("sorts by confidence and match", () => {
    const byConfidence = sortAndFilterWitnesses(witnesses, "confidence", "all");
    expect(byConfidence.map((w) => w.witnessId)).toEqual(["w-a", "w-c", "w-b"]);

    const byMatch = sortAndFilterWitnesses(witnesses, "match", "all");
    expect(byMatch.map((w) => w.witnessId)).toEqual(["w-b", "w-c", "w-a"]);
  });

  it("filters disagreements and partials", () => {
    const disagreements = sortAndFilterWitnesses(witnesses, "confidence", "disagreement");
    expect(disagreements.map((w) => w.witnessId)).toEqual(["w-a", "w-c"]);

    const partialOnly = sortAndFilterWitnesses(witnesses, "confidence", "partial");
    expect(partialOnly.map((w) => w.witnessId)).toEqual(["w-c", "w-b"]);
  });
});
