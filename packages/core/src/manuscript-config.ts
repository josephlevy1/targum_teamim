import type { VerseId } from "./types.js";

export const MANUSCRIPT_NORMALIZATION_FORM = "NFC" as const;

export const MANUSCRIPT_WITNESS_IDS = {
  vaticanMs448: "vatican_ms_448",
  vaticanMs19: "vatican_ms_19",
  baselineDigital: "baseline_digital",
} as const;

export type ManuscriptWitnessId = (typeof MANUSCRIPT_WITNESS_IDS)[keyof typeof MANUSCRIPT_WITNESS_IDS];

const VERSE_ID_PATTERN = /^[^:\s][^:]*:[1-9]\d*:[1-9]\d*$/;

export function isCanonicalVerseId(value: string): value is VerseId {
  return VERSE_ID_PATTERN.test(value);
}

export function parseCanonicalVerseId(value: string): VerseId {
  if (!isCanonicalVerseId(value)) {
    throw new Error(`Invalid verse_id: ${value}`);
  }
  return value;
}
