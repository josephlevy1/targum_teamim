export const HEBREW_LETTER_RE = /[\u05D0-\u05EA]/;
export const NIQQUD_RE = /[\u05B0-\u05BC\u05C1\u05C2\u05C4\u05C5\u05C7]/;
export const TAAM_RE = /[\u0591-\u05AF]/;
export const SOF_PASUK = "\u05C3";

export function normalizeNfd(text: string): string {
  return text.normalize("NFD");
}

export function tokenizeWords(text: string): string[] {
  return normalizeNfd(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function isHebrewLetter(ch: string): boolean {
  return HEBREW_LETTER_RE.test(ch);
}

export function isNiqqud(ch: string): boolean {
  return NIQQUD_RE.test(ch);
}

export function isTaam(ch: string): boolean {
  return TAAM_RE.test(ch);
}
