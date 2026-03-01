type WitnessLike = {
  sourceConfidence: number;
  matchScore: number;
  artifacts?: Record<string, unknown>;
};

export function sortWitnessRows<T extends WitnessLike>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    if (b.sourceConfidence !== a.sourceConfidence) return b.sourceConfidence - a.sourceConfidence;
    return b.matchScore - a.matchScore;
  });
}

export function enrichWitnessArtifacts<T extends WitnessLike>(rows: T[]): Array<T & { artifacts: Record<string, unknown> }> {
  return rows.map((row) => ({
    ...row,
    artifacts: {
      ...(row.artifacts ?? {}),
      tokenStats: row.artifacts?.["tokenStats"] ?? null,
      charStats: row.artifacts?.["charStats"] ?? null,
      replaceDetails: row.artifacts?.["replaceDetails"] ?? {},
    },
  }));
}
