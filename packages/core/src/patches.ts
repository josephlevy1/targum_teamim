import type { GeneratedTaam, PatchEntry, PatchOp } from "./types.js";
import { cloneGenerated } from "./parser.js";

function findTaamIndex(taamim: GeneratedTaam[], taamId: string): number {
  return taamim.findIndex((t) => t.taamId === taamId);
}

export function applyPatch(taamim: GeneratedTaam[], op: PatchOp): GeneratedTaam[] {
  const next = cloneGenerated(taamim);

  if (op.type === "INSERT_TAAM") {
    next.push({ ...op.taam, position: { ...op.taam.position }, reasons: [...op.taam.reasons] });
    return next;
  }

  const idx = findTaamIndex(next, op.taamId);
  if (idx === -1) {
    return next;
  }

  if (op.type === "DELETE_TAAM") {
    next.splice(idx, 1);
    return next;
  }

  if (op.type === "MOVE_TAAM") {
    next[idx].position = { ...op.to };
    next[idx].reasons = [...next[idx].reasons, "manual-move"];
    next[idx].confidence = Math.max(0, next[idx].confidence - 0.2);
    return next;
  }

  if (op.type === "SWAP_TAAM") {
    next[idx].name = op.newName;
    next[idx].unicodeMark = op.newUnicodeMark;
    next[idx].tier = op.newTier;
    next[idx].reasons = [...next[idx].reasons, "manual-swap"];
    return next;
  }

  return next;
}

export function applyPatchLog(
  taamim: GeneratedTaam[],
  entries: PatchEntry[],
  patchCursor?: number,
  presorted = false,
): GeneratedTaam[] {
  const sorted = presorted ? entries : [...entries].sort((a, b) => a.seqNo - b.seqNo);
  const limit = patchCursor ?? sorted.length;
  let current = cloneGenerated(taamim);

  for (let i = 0; i < sorted.length && i < limit; i += 1) {
    current = applyPatch(current, sorted[i].op);
  }

  return current;
}

export function newPatchEntry(
  verseId: string,
  op: PatchOp,
  author: string,
  seqNo: number,
  note?: string,
): PatchEntry {
  return {
    id: crypto.randomUUID(),
    verseId: verseId as any,
    op,
    author,
    note,
    createdAt: new Date().toISOString(),
    seqNo,
  };
}
