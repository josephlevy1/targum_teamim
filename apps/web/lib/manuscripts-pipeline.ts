import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { MANUSCRIPT_NORMALIZATION_FORM, compareVerseIdsCanonical, isHebrewLetter, isTaam, isVerseIdInRange } from "@targum/core";
import { getDataPaths } from "./config";
import { getRepository } from "./repository";
import { createDeterministicCrop } from "./manuscripts-images";
import { runOcrWithRetry } from "./manuscripts-ocr";

function normalizeComparisonText(text: string): string {
  return text
    .normalize(MANUSCRIPT_NORMALIZATION_FORM)
    .replace(/\s+/g, " ")
    .trim();
}

function renderAramaicFromVerseId(verseId: string): string {
  const repo = getRepository();
  const record = repo.getVerseRecord(verseId as any);
  if (!record) return "";
  return record.verse.aramaicTokens
    .map((token) => token.letters.map((letter) => `${letter.baseChar}${letter.niqqud.join("")}`).join(""))
    .join(" ");
}

function listVerseIdsInRange(startVerseId: string, endVerseId: string): string[] {
  const repo = getRepository();
  return repo
    .listVerseIds()
    .filter((id) => isVerseIdInRange(id, startVerseId as any, endVerseId as any))
    .sort(compareVerseIdsCanonical);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function createRegionCrop(regionId: string): { cropPath: string } {
  const repo = getRepository();
  const region = repo.getPageRegion(regionId);
  if (!region) throw new Error(`Region not found: ${regionId}`);
  const page = repo.getPage(region.pageId);
  if (!page) throw new Error(`Page not found: ${region.pageId}`);

  const { dataDir } = getDataPaths();
  const outDir = path.join(dataDir, "imports", "manuscripts", "crops");
  ensureDir(outDir);
  throw new Error("createRegionCrop is now async. Use createRegionCropAsync.");
}

export async function createRegionCropAsync(regionId: string): Promise<{ cropPath: string; cropMetadata: Record<string, unknown> }> {
  const repo = getRepository();
  const region = repo.getPageRegion(regionId);
  if (!region) throw new Error(`Region not found: ${regionId}`);
  const page = repo.getPage(region.pageId);
  if (!page) throw new Error(`Page not found: ${region.pageId}`);

  const { dataDir } = getDataPaths();
  const outDir = path.join(dataDir, "imports", "manuscripts", "crops");
  ensureDir(outDir);
  const crop = await createDeterministicCrop({
    pagePath: page.imagePath,
    bbox: region.bbox,
    outDir,
    regionId,
    pageIndex: page.pageIndex,
  });

  return {
    cropPath: crop.cropPath,
    cropMetadata: crop.metadata,
  };
}

export async function runRegionOcr(regionId: string): Promise<{
  jobId?: string;
  regionId: string;
  cropPath: string;
  textRaw: string;
  ocrMeanConf: number;
  ocrCharCount: number;
  coverageRatioEst: number;
}> {
  const repo = getRepository();
  const region = repo.getPageRegion(regionId);
  if (!region) throw new Error(`Region not found: ${regionId}`);
  const page = repo.getPage(region.pageId);
  if (!page) throw new Error(`Page not found: ${region.pageId}`);
  if (!region.startVerseId || !region.endVerseId) {
    throw new Error("Region requires verse range tagging before OCR.");
  }

  const job = repo.createOcrJob(regionId);
  repo.updateOcrJobStatus(job.id, "running");

  try {
    const crop = await createRegionCropAsync(regionId);
    const ocr = await runOcrWithRetry(crop.cropPath);

    repo.upsertRegionOcrArtifact({
      regionId,
      cropPath: crop.cropPath,
      cropMetadata: crop.cropMetadata,
      textRaw: ocr.textRaw,
      ocrMeanConf: ocr.meanConfidence,
      ocrCharCount: ocr.charCount,
      coverageRatioEst: ocr.coverageEstimate,
      engine: ocr.engine,
    });
    repo.updateOcrJobStatus(job.id, "completed");

    return {
      jobId: job.id,
      regionId,
      cropPath: crop.cropPath,
      textRaw: ocr.textRaw,
      ocrMeanConf: ocr.meanConfidence,
      ocrCharCount: ocr.charCount,
      coverageRatioEst: ocr.coverageEstimate,
    };
  } catch (error) {
    repo.updateOcrJobStatus(job.id, "failed", error instanceof Error ? error.message : "OCR failure");
    throw error;
  }
}

type Alignment = {
  editDistance: number;
  matchScore: number;
  tokenDiffOps: Array<{ op: "equal" | "replace" | "insert" | "delete"; a?: string; b?: string }>;
};

export function alignWitnessToBaseline(witnessText: string, baselineText: string): Alignment {
  const a = normalizeComparisonText(witnessText);
  const b = normalizeComparisonText(baselineText);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const editDistance = dp[m][n];
  const maxLen = Math.max(m, n, 1);
  const matchScore = Math.max(0, 1 - editDistance / maxLen);

  const aTokens = a ? a.split(" ") : [];
  const bTokens = b ? b.split(" ") : [];
  const maxTokens = Math.max(aTokens.length, bTokens.length);
  const tokenDiffOps: Alignment["tokenDiffOps"] = [];
  for (let i = 0; i < maxTokens; i += 1) {
    const av = aTokens[i];
    const bv = bTokens[i];
    if (av === undefined) tokenDiffOps.push({ op: "insert", b: bv });
    else if (bv === undefined) tokenDiffOps.push({ op: "delete", a: av });
    else if (av === bv) tokenDiffOps.push({ op: "equal", a: av, b: bv });
    else tokenDiffOps.push({ op: "replace", a: av, b: bv });
  }

  return { editDistance, matchScore, tokenDiffOps };
}

function splitRegionTextByBaseline(regionText: string, baselines: string[]): { slices: string[]; partial: boolean; reason?: string } {
  const normalizedRegion = normalizeComparisonText(regionText);
  if (!normalizedRegion) {
    return { slices: baselines.map(() => ""), partial: true, reason: "EMPTY_OCR_TEXT" };
  }

  const lines = regionText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length >= baselines.length) {
    return { slices: baselines.map((_, idx) => lines[idx] ?? ""), partial: false };
  }

  const total = baselines.reduce((sum, text) => sum + normalizeComparisonText(text).length, 0);
  if (total <= 0) {
    return { slices: baselines.map(() => ""), partial: true, reason: "EMPTY_BASELINE_RANGE" };
  }

  const slices: string[] = [];
  let cursor = 0;
  for (let i = 0; i < baselines.length; i += 1) {
    const ratio = normalizeComparisonText(baselines[i]).length / total;
    const size = i === baselines.length - 1 ? normalizedRegion.length - cursor : Math.max(1, Math.round(normalizedRegion.length * ratio));
    slices.push(normalizedRegion.slice(cursor, cursor + size).trim());
    cursor += size;
  }

  const partial = slices.some((slice) => slice.length === 0);
  return { slices, partial, reason: partial ? "LOW_TEXT_COVERAGE" : undefined };
}

export async function splitRegionIntoWitnessVerses(regionId: string): Promise<{
  witnessId: string;
  verseIds: string[];
  status: "ok" | "partial";
  reason?: string;
}> {
  const repo = getRepository();
  const region = repo.getPageRegion(regionId);
  if (!region) throw new Error(`Region not found: ${regionId}`);
  if (!region.startVerseId || !region.endVerseId) {
    throw new Error("Region requires start_verse_id and end_verse_id.");
  }
  const page = repo.getPage(region.pageId);
  if (!page) throw new Error(`Page not found: ${region.pageId}`);
  const ocr = repo.getRegionOcrArtifact(regionId) ?? (await runRegionOcr(regionId));

  const verseIds = listVerseIdsInRange(region.startVerseId, region.endVerseId);
  const baselineByVerse = verseIds.map((verseId) => renderAramaicFromVerseId(verseId));
  const split = splitRegionTextByBaseline(ocr.textRaw, baselineByVerse);

  verseIds.forEach((verseId, index) => {
    const textRaw = split.slices[index] ?? "";
    const textNormalized = normalizeComparisonText(textRaw);
    const alignment = alignWitnessToBaseline(textNormalized, baselineByVerse[index]);
    const completenessScore = region.status === "ok" ? 1 : region.status === "partial" ? 0.6 : 0.2;
    const clarityScore = Math.max(0, Math.min(1, (ocr.ocrMeanConf * 0.7 + ocr.coverageRatioEst * 0.3)));
    repo.upsertWitnessVerse({
      verseId,
      witnessId: page.witnessId,
      textRaw,
      textNormalized,
      clarityScore,
      matchScore: alignment.matchScore,
      completenessScore,
      sourceConfidence: 0,
      status: split.partial ? "partial" : "ok",
      artifacts: {
        regionId,
        editDistance: alignment.editDistance,
        tokenDiffOps: alignment.tokenDiffOps,
        splitReason: split.reason ?? null,
      },
    });
  });

  return {
    witnessId: page.witnessId,
    verseIds,
    status: split.partial ? "partial" : "ok",
    reason: split.reason,
  };
}

function getAuthorityWeight(witnessId: string): number {
  const repo = getRepository();
  return repo.getWitness(witnessId)?.authorityWeight ?? 0.4;
}

export function recomputeSourceConfidence(verseId: string): { verseId: string; witnessCount: number } {
  const repo = getRepository();
  const rows = repo.listWitnessVersesForVerse(verseId);
  rows.forEach((row) => {
    const authority = getAuthorityWeight(row.witnessId);
    const confidence = Math.max(
      0,
      Math.min(1, authority * 0.35 + row.clarityScore * 0.3 + row.matchScore * 0.25 + row.completenessScore * 0.1),
    );
    repo.upsertWitnessVerse({
      verseId: row.verseId,
      witnessId: row.witnessId,
      textRaw: row.textRaw,
      textNormalized: row.textNormalized,
      clarityScore: row.clarityScore,
      matchScore: row.matchScore,
      completenessScore: row.completenessScore,
      sourceConfidence: confidence,
      status: row.status,
      artifacts: row.artifacts,
    });
  });
  return { verseId, witnessCount: rows.length };
}

export function recomputeCascadeForVerse(verseId: string, thresholds = { vatican: 0.7, hebrewbooks: 0.65 }) {
  const repo = getRepository();
  const candidates = repo.listWitnessVersesForVerse(verseId);
  const byWitnessId = new Map(candidates.map((row) => [row.witnessId, row]));
  const vatican = candidates
    .filter((row) => row.witnessId.startsWith("vatican_"))
    .sort((a, b) => b.sourceConfidence - a.sourceConfidence)[0];
  const hebrewBooks = candidates
    .filter((row) => row.witnessId.startsWith("hebrewbooks_"))
    .sort((a, b) => b.sourceConfidence - a.sourceConfidence)[0];
  const baselineText = renderAramaicFromVerseId(verseId);
  const reasonCodes: string[] = [];
  let selectedSource = "baseline_digital";
  let selectedText = baselineText;
  let ensembleConfidence = 0.45;

  if (vatican && vatican.sourceConfidence >= thresholds.vatican) {
    selectedSource = vatican.witnessId;
    selectedText = vatican.textNormalized || vatican.textRaw;
    ensembleConfidence = vatican.sourceConfidence;
  } else if (hebrewBooks && hebrewBooks.sourceConfidence >= thresholds.hebrewbooks) {
    selectedSource = hebrewBooks.witnessId;
    selectedText = hebrewBooks.textNormalized || hebrewBooks.textRaw;
    ensembleConfidence = hebrewBooks.sourceConfidence;
    reasonCodes.push("VATICAN_LOW_CLARITY");
  } else {
    reasonCodes.push("SCAN_WITNESSES_BELOW_THRESHOLD");
  }

  const flags: string[] = [];
  if (vatican && hebrewBooks && vatican.sourceConfidence >= thresholds.vatican && hebrewBooks.sourceConfidence >= thresholds.hebrewbooks) {
    const disagreement = alignWitnessToBaseline(vatican.textNormalized, hebrewBooks.textNormalized).matchScore < 0.8;
    if (disagreement) {
      flags.push("DISAGREEMENT_FLAG");
      reasonCodes.push("HIGH_CONFIDENCE_DISAGREEMENT");
      ensembleConfidence = Math.min(ensembleConfidence, 0.7);
    } else {
      ensembleConfidence = Math.min(1, ensembleConfidence + 0.08);
    }
  }

  if (!vatican) reasonCodes.push("VATICAN_UNAVAILABLE");
  if (!hebrewBooks) reasonCodes.push("HEBREWBOOKS_UNAVAILABLE");

  const stored = repo.upsertWorkingVerseText({
    verseId,
    selectedSource,
    selectedTextNormalized: normalizeComparisonText(selectedText),
    selectedTextSurface: selectedText,
    ensembleConfidence,
    flags,
    reasonCodes,
  });

  return {
    verseId,
    selectedSource: stored.selectedSource,
    ensembleConfidence: stored.ensembleConfidence,
    flags: stored.flags,
    reasonCodes: stored.reasonCodes,
    candidates: Array.from(byWitnessId.values()),
  };
}

function letterCount(text: string): number {
  let count = 0;
  for (const ch of text.normalize(MANUSCRIPT_NORMALIZATION_FORM)) {
    if (isHebrewLetter(ch)) count += 1;
  }
  return count;
}

function extractWitnessTaam(text: string): Array<{ mark: string; witnessLetterOrdinal: number }> {
  const out: Array<{ mark: string; witnessLetterOrdinal: number }> = [];
  let lettersSeen = 0;
  for (const ch of text.normalize(MANUSCRIPT_NORMALIZATION_FORM)) {
    if (isHebrewLetter(ch)) {
      lettersSeen += 1;
      continue;
    }
    if (isTaam(ch) && lettersSeen > 0) {
      out.push({ mark: ch, witnessLetterOrdinal: lettersSeen - 1 });
    }
  }
  return out;
}

function mapLetterOrdinalToTokenPosition(verseId: string, targetOrdinal: number): { tokenIndex: number; letterIndex: number } {
  const repo = getRepository();
  const record = repo.getVerseRecord(verseId as any);
  if (!record || record.verse.aramaicTokens.length === 0) return { tokenIndex: 0, letterIndex: 0 };
  let cursor = 0;
  for (let t = 0; t < record.verse.aramaicTokens.length; t += 1) {
    const token = record.verse.aramaicTokens[t];
    for (let l = 0; l < token.letters.length; l += 1) {
      if (cursor >= targetOrdinal) return { tokenIndex: t, letterIndex: l };
      cursor += 1;
    }
  }
  const lastToken = record.verse.aramaicTokens.length - 1;
  const lastLetter = Math.max(0, record.verse.aramaicTokens[lastToken]?.letters.length - 1);
  return { tokenIndex: lastToken, letterIndex: lastLetter };
}

function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}

export function getSystemTelemetry(queueDepth = 0): {
  rssMb: number;
  cpuPct: number;
  queueDepth: number;
  throttleState: "normal" | "reduced" | "single";
  limits: { ocrWorkers: number; splitRemapWorkers: number; taamAlignWorkers: number; imageFallbackWorkers: number; globalHeavyCap: number };
} {
  const rssMb = process.memoryUsage().rss / (1024 * 1024);
  const cpuPct = Math.min(100, Math.max(0, (process.cpuUsage().user + process.cpuUsage().system) / 10000));
  const throttleState: "normal" | "reduced" | "single" = rssMb > 7000 ? "single" : rssMb > 6200 ? "reduced" : "normal";
  const base = throttleState === "single" ? 1 : 2;
  return {
    rssMb,
    cpuPct,
    queueDepth,
    throttleState,
    limits: {
      ocrWorkers: base,
      splitRemapWorkers: base,
      taamAlignWorkers: base,
      imageFallbackWorkers: throttleState === "normal" ? 1 : 0,
      globalHeavyCap: throttleState === "single" ? 1 : 3,
    },
  };
}

export async function remapWitnessRegionsBySnippet(input: {
  witnessId: string;
  minScore?: number;
  minMargin?: number;
  maxWindow?: number;
}): Promise<{ witnessId: string; total: number; assigned: number; ambiguous: number; unassigned: number }> {
  const repo = getRepository();
  const minScore = input.minScore ?? 0.78;
  const minMargin = input.minMargin ?? 0.08;
  const maxWindow = input.maxWindow ?? 5;
  const verseIds = repo.listVerseIds().sort(compareVerseIdsCanonical);
  const baselineByVerse = new Map(verseIds.map((id) => [id, normalizeComparisonText(renderAramaicFromVerseId(id))]));
  const regions = repo.listRegionsByWitness(input.witnessId);

  let assigned = 0;
  let ambiguous = 0;
  let unassigned = 0;

  for (const region of regions) {
    const ocr = repo.getRegionOcrArtifact(region.id);
    const ocrText = normalizeComparisonText(ocr?.textRaw ?? "");
    if (!ocrText) {
      unassigned += 1;
      repo.upsertPageRegion({
        id: region.id,
        pageId: region.pageId,
        regionIndex: region.regionIndex,
        bbox: region.bbox,
        startVerseId: region.startVerseId,
        endVerseId: region.endVerseId,
        remapMethod: "snippet-fuzzy-v1",
        remapConfidence: 0,
        remapCandidates: [],
        remapReviewRequired: true,
        status: region.status,
        notes: `${region.notes} | remap: OCR_EMPTY`,
      });
      continue;
    }

    const ranked: Array<{ startVerseId: string; endVerseId: string; score: number }> = [];
    for (let i = 0; i < verseIds.length; i += 1) {
      let windowText = "";
      for (let width = 1; width <= maxWindow && i + width - 1 < verseIds.length; width += 1) {
        const currentVerseId = verseIds[i + width - 1];
        windowText = `${windowText} ${baselineByVerse.get(currentVerseId) ?? ""}`.trim();
        const score = alignWitnessToBaseline(ocrText, windowText).matchScore;
        ranked.push({ startVerseId: verseIds[i], endVerseId: currentVerseId, score });
      }
    }
    ranked.sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const second = ranked[1];
    const shouldAssign = Boolean(top) && top.score >= minScore && (top.score - (second?.score ?? 0)) >= minMargin;
    if (!top) {
      unassigned += 1;
      continue;
    }

    if (shouldAssign) {
      assigned += 1;
    } else {
      ambiguous += 1;
    }

    repo.upsertPageRegion({
      id: region.id,
      pageId: region.pageId,
      regionIndex: region.regionIndex,
      bbox: region.bbox,
      startVerseId: shouldAssign ? top.startVerseId : region.startVerseId,
      endVerseId: shouldAssign ? top.endVerseId : region.endVerseId,
      remapMethod: "snippet-fuzzy-v1",
      remapConfidence: top.score,
      remapCandidates: ranked.slice(0, 3),
      remapReviewRequired: !shouldAssign,
      status: region.status,
      notes: `${region.notes} | remap: ${shouldAssign ? "auto-assigned" : "review-required"}`,
    });
  }

  return {
    witnessId: input.witnessId,
    total: regions.length,
    assigned,
    ambiguous,
    unassigned,
  };
}

export async function backfillWitnessFromRemap(witnessId: string): Promise<{ witnessId: string; regions: number; versesTouched: number }> {
  const repo = getRepository();
  const regions = repo
    .listRegionsByWitness(witnessId)
    .filter((r) => r.startVerseId && r.endVerseId)
    .filter((r) => !r.remapReviewRequired);

  const touched = new Set<string>();
  for (const region of regions) {
    const result = await splitRegionIntoWitnessVerses(region.id);
    for (const verseId of result.verseIds) {
      touched.add(verseId);
      recomputeSourceConfidence(verseId);
      recomputeCascadeForVerse(verseId);
    }
  }
  return { witnessId, regions: regions.length, versesTouched: touched.size };
}

export function runTaamAlignmentForVerse(verseId: string, targetLayer = "working_text"): {
  verseId: string;
  targetLayer: string;
  targetTextHash: string;
  alignedWitnesses: number;
} {
  const repo = getRepository();
  const witnesses = repo.listWitnessVersesForVerse(verseId);
  const working = repo.getWorkingVerseText(verseId);
  const targetText = normalizeComparisonText(working?.selectedTextNormalized || working?.selectedTextSurface || renderAramaicFromVerseId(verseId));
  const targetLetters = Math.max(1, letterCount(targetText));
  const targetTextHash = hashText(targetText);

  let alignedWitnesses = 0;
  for (const witness of witnesses) {
    const witnessText = normalizeComparisonText(witness.textNormalized || witness.textRaw);
    const witnessLetters = Math.max(1, letterCount(witnessText));
    const extracted = extractWitnessTaam(witness.textRaw || witness.textNormalized);
    const aligned = extracted.map((entry, idx) => {
      const mappedOrdinal = Math.round((entry.witnessLetterOrdinal / witnessLetters) * (targetLetters - 1));
      const position = mapLetterOrdinalToTokenPosition(verseId, mappedOrdinal);
      return {
        taamId: `${witness.witnessId}:${verseId}:${idx}`,
        name: `OCR_${entry.mark.codePointAt(0)?.toString(16) ?? "mark"}`,
        unicodeMark: entry.mark,
        tier: "CONJUNCTIVE",
        position,
        confidence: Math.max(0.2, Math.min(0.95, witness.sourceConfidence * 0.9)),
        sourceWitnessId: witness.witnessId,
      };
    });

    repo.upsertWitnessTaamAlignment({
      verseId,
      witnessId: witness.witnessId,
      targetLayer,
      targetTextHash,
      taam: aligned,
      metrics: {
        extractedCount: extracted.length,
        alignedCount: aligned.length,
        witnessLetters,
        targetLetters,
      },
      status: aligned.length > 0 ? "ok" : "partial",
    });
    alignedWitnesses += 1;
  }

  return { verseId, targetLayer, targetTextHash, alignedWitnesses };
}

export function recomputeTaamConsensusForVerse(verseId: string, targetLayer = "working_text"): {
  verseId: string;
  targetLayer: string;
  consensusCount: number;
  ensembleConfidence: number;
  flags: string[];
} {
  const repo = getRepository();
  const working = repo.getWorkingVerseText(verseId);
  const targetText = normalizeComparisonText(working?.selectedTextNormalized || working?.selectedTextSurface || renderAramaicFromVerseId(verseId));
  const targetTextHash = hashText(targetText);
  const alignments = repo.listWitnessTaamAlignmentsForVerse(verseId, targetLayer).filter((row) => row.targetTextHash === targetTextHash);

  const bucket = new Map<string, { weight: number; sample: Record<string, unknown> }>();
  for (const alignment of alignments) {
    const witness = repo.getWitnessVerse(verseId, alignment.witnessId);
    const weight = witness?.sourceConfidence ?? 0.2;
    for (const mark of alignment.taam) {
      const pos = (mark.position ?? {}) as { tokenIndex?: number; letterIndex?: number };
      const key = `${pos.tokenIndex ?? 0}:${pos.letterIndex ?? 0}:${String(mark.unicodeMark ?? "")}`;
      const current = bucket.get(key);
      if (current) current.weight += weight;
      else bucket.set(key, { weight, sample: mark });
    }
  }

  const ranked = Array.from(bucket.values()).sort((a, b) => b.weight - a.weight);
  const totalWeight = ranked.reduce((sum, item) => sum + item.weight, 0) || 1;
  const consensus = ranked.slice(0, 128).map((item) => ({
    ...item.sample,
    confidence: Math.max(0.2, Math.min(0.99, item.weight / totalWeight)),
    reasons: ["consensus-vote"],
  }));
  const ensembleConfidence = consensus.length > 0 ? Math.min(0.99, ranked[0]?.weight / totalWeight + 0.35) : 0.2;
  const flags: string[] = [];
  if (consensus.length === 0) flags.push("MISSING_TAAM_SIGNAL");
  if (ranked.length > consensus.length + 20) flags.push("TAAM_DISAGREEMENT");
  if (ensembleConfidence < 0.65) flags.push("LOW_TAAM_CONFIDENCE");
  const reasonCodes = flags.length > 0 ? flags.map((flag) => `${flag}_AUTO`) : ["CONSENSUS_OK"];

  repo.upsertWorkingTaamConsensus({
    verseId,
    targetLayer,
    targetTextHash,
    consensusTaam: consensus,
    ensembleConfidence,
    flags,
    reasonCodes,
  });

  return { verseId, targetLayer, consensusCount: consensus.length, ensembleConfidence, flags };
}
