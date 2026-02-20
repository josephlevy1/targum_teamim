import { spawnSync } from "node:child_process";

export interface OcrResult {
  textRaw: string;
  meanConfidence: number;
  coverageEstimate: number;
  charCount: number;
  engine: string;
  raw: Record<string, unknown>;
}

export class OcrError extends Error {
  constructor(
    public readonly code: "OCR_ENGINE_NOT_FOUND" | "OCR_TIMEOUT" | "OCR_EXEC_FAILED" | "OCR_PARSE_FAILED",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface OcrRunnerConfig {
  engine: "tesseract" | "command-json";
  command?: string;
  commandArgs?: string[];
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number;
  language: string;
}

export function loadOcrConfig(): OcrRunnerConfig {
  return {
    engine: (process.env.MANUSCRIPT_OCR_ENGINE as "tesseract" | "command-json") || "tesseract",
    command: process.env.MANUSCRIPT_OCR_COMMAND || undefined,
    commandArgs: process.env.MANUSCRIPT_OCR_COMMAND_ARGS ? process.env.MANUSCRIPT_OCR_COMMAND_ARGS.split(" ").filter(Boolean) : [],
    timeoutMs: Number(process.env.MANUSCRIPT_OCR_TIMEOUT_MS ?? 90_000),
    maxRetries: Number(process.env.MANUSCRIPT_OCR_MAX_RETRIES ?? 2),
    backoffMs: Number(process.env.MANUSCRIPT_OCR_BACKOFF_MS ?? 400),
    language: process.env.MANUSCRIPT_OCR_LANG || "heb",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseTesseractTsv(tsv: string): { meanConfidence: number; coverageEstimate: number } {
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return { meanConfidence: 0, coverageEstimate: 0 };
  const cells = lines.slice(1).map((line) => line.split("\t"));
  const confidences: number[] = [];
  let totalArea = 0;
  let coveredArea = 0;

  for (const row of cells) {
    const left = Number(row[6] ?? 0);
    const top = Number(row[7] ?? 0);
    const width = Number(row[8] ?? 0);
    const height = Number(row[9] ?? 0);
    const conf = Number(row[10] ?? -1);
    const text = (row[11] ?? "").trim();
    const area = Math.max(0, width) * Math.max(0, height);
    if (area > 0) {
      totalArea += area;
      if (text) coveredArea += area;
    }
    if (Number.isFinite(conf) && conf >= 0) confidences.push(conf);
    if (!Number.isFinite(left + top)) continue;
  }

  const meanConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length / 100
    : 0;
  const coverageEstimate = totalArea > 0 ? Math.min(1, coveredArea / totalArea) : 0;
  return {
    meanConfidence: Math.max(0, Math.min(1, meanConfidence)),
    coverageEstimate: Math.max(0, Math.min(1, coverageEstimate)),
  };
}

function runCommand(cmd: string, args: string[], timeoutMs: number): { stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new OcrError("OCR_ENGINE_NOT_FOUND", `OCR executable not found: ${cmd}`, { cmd });
  }
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    throw new OcrError("OCR_TIMEOUT", `OCR command timed out after ${timeoutMs}ms`, { cmd, args });
  }
  if (result.status !== 0) {
    throw new OcrError("OCR_EXEC_FAILED", `OCR command failed with exit code ${result.status ?? "unknown"}`, {
      cmd,
      args,
      stderr: result.stderr,
    });
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function runTesseract(cropPath: string, config: OcrRunnerConfig): OcrResult {
  const command = config.command || "tesseract";
  const textRun = runCommand(command, [cropPath, "stdout", "-l", config.language], config.timeoutMs);
  const tsvRun = runCommand(command, [cropPath, "stdout", "tsv", "-l", config.language], config.timeoutMs);
  const parsed = parseTesseractTsv(tsvRun.stdout);
  return {
    textRaw: textRun.stdout,
    meanConfidence: parsed.meanConfidence,
    coverageEstimate: parsed.coverageEstimate,
    charCount: textRun.stdout.length,
    engine: "tesseract",
    raw: {
      stderr: textRun.stderr,
    },
  };
}

function runJsonCommand(cropPath: string, config: OcrRunnerConfig): OcrResult {
  const command = config.command;
  if (!command) {
    throw new OcrError("OCR_EXEC_FAILED", "MANUSCRIPT_OCR_COMMAND is required for command-json engine");
  }

  const run = runCommand(command, [...(config.commandArgs ?? []), cropPath], config.timeoutMs);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(run.stdout) as Record<string, unknown>;
  } catch {
    throw new OcrError("OCR_PARSE_FAILED", "command-json OCR must return valid JSON");
  }

  const textRaw = String(parsed.text_raw ?? parsed.text ?? "");
  const meanConfidence = Number(parsed.mean_confidence ?? parsed.ocrMeanConf ?? 0);
  const coverageEstimate = Number(parsed.coverage_estimate ?? parsed.coverageRatioEst ?? 0);
  return {
    textRaw,
    meanConfidence: Number.isFinite(meanConfidence) ? Math.max(0, Math.min(1, meanConfidence)) : 0,
    coverageEstimate: Number.isFinite(coverageEstimate) ? Math.max(0, Math.min(1, coverageEstimate)) : 0,
    charCount: textRaw.length,
    engine: "command-json",
    raw: parsed,
  };
}

function runOnce(cropPath: string, config: OcrRunnerConfig): OcrResult {
  if (config.engine === "command-json") return runJsonCommand(cropPath, config);
  return runTesseract(cropPath, config);
}

export async function runOcrWithRetry(cropPath: string, config = loadOcrConfig()): Promise<OcrResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt += 1) {
    try {
      return runOnce(cropPath, config);
    } catch (error) {
      lastError = error;
      if (attempt > config.maxRetries) break;
      await sleep(config.backoffMs * attempt);
    }
  }

  if (lastError instanceof OcrError) throw lastError;
  throw new OcrError("OCR_EXEC_FAILED", "OCR run failed", {
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  });
}
