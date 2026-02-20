import fs from "node:fs";
import path from "node:path";
import { MANUSCRIPT_NORMALIZATION_FORM, compareVerseIdsCanonical, isVerseIdInRange } from "@targum/core";
import { getDataPaths } from "./config";
import { getRepository } from "./repository";

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
  const ext = path.extname(page.imagePath) || ".img";
  const cropPath = path.join(outDir, `${regionId.replace(/[^a-zA-Z0-9_-]+/g, "_")}${ext}`);
  fs.copyFileSync(page.imagePath, cropPath);
  return { cropPath };
}

export function runRegionOcr(regionId: string): {
  jobId?: string;
  regionId: string;
  cropPath: string;
  textRaw: string;
  ocrMeanConf: number;
  ocrCharCount: number;
  coverageRatioEst: number;
} {
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
    const crop = createRegionCrop(regionId);
    const verseIds = listVerseIdsInRange(region.startVerseId, region.endVerseId);
    const baseline = verseIds.map((verseId) => renderAramaicFromVerseId(verseId)).join("\n");
    const textRaw = baseline || `[OCR placeholder] ${path.basename(page.imagePath)} region ${regionId}`;
    const ocrCharCount = textRaw.length;
    const ocrMeanConf = baseline ? 0.9 : 0.35;
    const coverageRatioEst = region.status === "ok" ? 1 : region.status === "partial" ? 0.6 : 0.1;

    repo.upsertRegionOcrArtifact({
      regionId,
      cropPath: crop.cropPath,
      textRaw,
      ocrMeanConf,
      ocrCharCount,
      coverageRatioEst,
      engine: "baseline-scaffold-ocr",
    });
    repo.updateOcrJobStatus(job.id, "completed");

    return {
      jobId: job.id,
      regionId,
      cropPath: crop.cropPath,
      textRaw,
      ocrMeanConf,
      ocrCharCount,
      coverageRatioEst,
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

export function splitRegionIntoWitnessVerses(regionId: string): {
  witnessId: string;
  verseIds: string[];
  status: "ok" | "partial";
  reason?: string;
} {
  const repo = getRepository();
  const region = repo.getPageRegion(regionId);
  if (!region) throw new Error(`Region not found: ${regionId}`);
  if (!region.startVerseId || !region.endVerseId) {
    throw new Error("Region requires start_verse_id and end_verse_id.");
  }
  const page = repo.getPage(region.pageId);
  if (!page) throw new Error(`Page not found: ${region.pageId}`);
  const ocr = repo.getRegionOcrArtifact(regionId) ?? runRegionOcr(regionId);

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
