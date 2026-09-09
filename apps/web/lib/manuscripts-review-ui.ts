export type WitnessSort = "confidence" | "match";
export type WitnessFilter = "all" | "disagreement" | "partial";

export type ReviewWitnessRow = {
  witnessId: string;
  sourceConfidence: number;
  matchScore: number;
  status: string;
  artifacts?: {
    tokenDiffOps?: Array<{ op: "equal" | "replace" | "insert" | "delete"; a?: string; b?: string }>;
    tokenStats?: {
      matches: number;
      replacements: number;
      inserts: number;
      deletes: number;
      alignedTokenCount: number;
    } | null;
    charStats?: {
      charMatchScore: number;
      charEditDistance?: number;
    } | null;
    replaceDetails?: Record<number, unknown>;
  };
};

export function sortAndFilterWitnesses<T extends ReviewWitnessRow>(
  witnesses: T[],
  witnessSort: WitnessSort,
  witnessFilter: WitnessFilter,
): T[] {
  const rows = witnesses.slice().sort((a, b) => {
    if (witnessSort === "confidence") {
      if (b.sourceConfidence !== a.sourceConfidence) return b.sourceConfidence - a.sourceConfidence;
      return b.matchScore - a.matchScore;
    }
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return b.sourceConfidence - a.sourceConfidence;
  });

  return rows.filter((row) => {
    if (witnessFilter === "partial") {
      return row.status === "partial" || row.status === "unavailable";
    }
    if (witnessFilter === "disagreement") {
      const charScore = row.artifacts?.charStats?.charMatchScore ?? row.matchScore;
      return row.sourceConfidence >= 0.65 && charScore < 0.8;
    }
    return true;
  });
}
