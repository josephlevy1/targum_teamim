import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { compareVerseIdsCanonical, generateForVerse, parseVerseId, type VerseId } from "@targum/core";
import { getRepository } from "./repository";
import { loadTransposeConfig } from "./config";
import { importHebrewLines, importTargumLines, parseTsvLines } from "./import";

export const TORAH_BOOKS = [
  { name: "Genesis", code: "01" },
  { name: "Exodus", code: "02" },
  { name: "Leviticus", code: "03" },
  { name: "Numbers", code: "04" },
  { name: "Deuteronomy", code: "05" },
] as const;

export type TorahBookName = (typeof TORAH_BOOKS)[number]["name"];
const BOOK_CODE_BY_NAME = new Map<TorahBookName, string>(TORAH_BOOKS.map((book) => [book.name, book.code]));

const DEFAULT_DELAY_MS = 500;
const DEFAULT_RETRIES = 3;
const USER_AGENT = "targum-teamim/0.1 (local pipeline; contact: local-user)";

interface FetchOptions {
  retries?: number;
  delayMs?: number;
  cacheDir?: string;
  useCache?: boolean;
}

export interface ScrapeOptions {
  books?: TorahBookName[];
  chapters?: { start: number; end: number };
  delayMs?: number;
  retries?: number;
  useCache?: boolean;
}

export interface ScrapeChapterSummary {
  chapter: number;
  hebrewUrl: string;
  aramaicUrl: string;
  hebrewVerseCount: number;
  aramaicVerseCount: number;
}

export interface ScrapeManifest {
  runAt: string;
  options: {
    books: TorahBookName[];
    chapterRange?: { start: number; end: number };
    delayMs: number;
    retries: number;
    useCache: boolean;
  };
  books: Array<{
    book: TorahBookName;
    code: string;
    totalChapters: number;
    selectedChapters: number[];
    chapters: ScrapeChapterSummary[];
  }>;
  totals: {
    hebrewVerses: number;
    aramaicVerses: number;
  };
  mismatches: string[];
  outputs: {
    hebrewTsvPath: string;
    targumTsvPath: string;
    hebrewSha256?: string;
    targumSha256?: string;
  };
}

export interface ScrapeResult {
  hebrewLines: string[];
  targumLines: string[];
  manifest: ScrapeManifest;
}

export interface RunOptions extends ScrapeOptions {
  resume?: boolean;
  force?: boolean;
}

interface StageState {
  status: "pending" | "completed";
  completedAt?: string;
  detail?: string;
}

interface RunCheckpoint {
  version: 1;
  updatedAt: string;
  stages: Record<"scrape" | "import-hebrew" | "import-targum" | "transpose" | "post-verify", StageState>;
  transposeProgress: Partial<Record<TorahBookName, number>>;
  stats?: {
    importedHebrew?: number;
    importedTargum?: number;
    transposed?: number;
    totalVerses?: number;
    generatedVerses?: number;
    missingGenerated?: string[];
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeVerseText(raw: string): string {
  return decodeHtmlEntities(
    raw
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\{[פס]\}/g, " ")
      .replace(/\u00A0/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseVerseBlocks(blockHtml: string): Array<{ verse: number; text: string }> {
  const out: Array<{ verse: number; text: string }> = [];
  const re = /<A NAME="(\d+)">\s*<\/A>\s*([\s\S]*?)(?=<A NAME="\d+">|<\/P>)/gi;

  for (const match of blockHtml.matchAll(re)) {
    const verse = Number(match[1]);
    const chunk = match[2] ?? "";
    const bStart = chunk.search(/<B>/i);
    const bEnd = bStart >= 0 ? chunk.indexOf("</B>", bStart) : -1;
    const tail = bEnd >= 0 ? chunk.slice(bEnd + 4) : chunk;
    const text = normalizeVerseText(tail);
    if (!Number.isFinite(verse) || !text) continue;
    out.push({ verse, text });
  }

  return out;
}

function assertContiguousVerses(book: TorahBookName, chapter: number, verses: Array<{ verse: number; text: string }>): void {
  if (verses.length === 0) {
    throw new Error(`${book} ${chapter}: no verses parsed`);
  }

  const seen = new Set<number>();
  let expected = 1;
  for (const item of verses) {
    if (seen.has(item.verse)) {
      throw new Error(`${book} ${chapter}: duplicate verse ${item.verse}`);
    }
    seen.add(item.verse);
    if (item.verse !== expected) {
      throw new Error(`${book} ${chapter}: non-contiguous verses, expected ${expected}, found ${item.verse}`);
    }
    expected += 1;
  }
}

function chapterUrl(kind: "he" | "ar", bookCode: string, chapter: number): string {
  const chapter2 = String(chapter).padStart(2, "0");
  if (kind === "he") {
    return `http://www.mechon-mamre.org/c/ct/c${bookCode}${chapter2}.htm`;
  }
  return `http://www.mechon-mamre.org/i/t/u/u${bookCode}${chapter2}.htm`;
}

async function fetchText(url: string, options: FetchOptions): Promise<string> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const cacheDir = options.cacheDir;
  const useCache = options.useCache ?? true;

  const cacheFile = cacheDir ? path.join(cacheDir, `${sha256(url)}.html`) : null;
  if (useCache && cacheFile && fs.existsSync(cacheFile)) {
    return fs.readFileSync(cacheFile, "utf8");
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} (${url})`);
      }
      const text = await res.text();
      if (useCache && cacheFile) {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, text, "utf8");
      }
      await sleep(delayMs);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await sleep(delayMs * Math.pow(2, attempt));
      }
    }
  }

  throw new Error(`Failed to fetch ${url}: ${String(lastError)}`);
}

function parseChapterCount(html: string, kind: "he" | "ar", bookCode: string): number {
  const prefix = kind === "he" ? `c${bookCode}` : `u${bookCode}`;
  const re = new RegExp(`${prefix}(\\d{2})\\.htm`, "g");
  const found = Array.from(html.matchAll(re)).map((m) => Number(m[1]));
  const max = Math.max(1, ...found);
  return max;
}

function parseChapterVerses(html: string, kind: "he" | "ar"): Array<{ verse: number; text: string }> {
  const klass = kind === "he" ? "ct" : "t";
  const openRe = new RegExp(`<P\\s+class=['"]${klass}['"]`, "i");
  const open = html.search(openRe);
  if (open < 0) {
    throw new Error(`Unable to find verse block for class=${klass}`);
  }
  const close = html.indexOf("</P>", open);
  if (close < 0) {
    throw new Error(`Unable to find closing verse block for class=${klass}`);
  }
  const start = Math.max(0, open - 120);
  const block = html.slice(start, close + 4);
  return parseVerseBlocks(block);
}

function ensureTorahBook(name: string): TorahBookName {
  if (!BOOK_CODE_BY_NAME.has(name as TorahBookName)) {
    throw new Error(`Unsupported Torah book: ${name}`);
  }
  return name as TorahBookName;
}

function selectedBooks(input?: TorahBookName[]): TorahBookName[] {
  if (!input || input.length === 0) {
    return TORAH_BOOKS.map((b) => b.name);
  }
  return input.map((b) => ensureTorahBook(b));
}

function selectedChapterNumbers(total: number, range?: { start: number; end: number }): number[] {
  if (!range) {
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }
  const start = Math.max(1, range.start);
  const end = Math.min(total, range.end);
  if (start > end) {
    return [];
  }
  return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
}

function outputPaths() {
  const cwd = process.cwd();
  const webSuffix = `${path.sep}apps${path.sep}web`;
  const root = cwd.endsWith(webSuffix) ? path.resolve(cwd, "../..") : cwd;
  const importsDir = path.join(root, "data", "imports");
  return {
    importsDir,
    cacheDir: path.join(importsDir, "html_cache"),
    hebrewTsv: path.join(importsDir, "hebrew_torah.tsv"),
    targumTsv: path.join(importsDir, "targum_torah.tsv"),
    manifest: path.join(importsDir, "torah_scrape_manifest.json"),
    checkpoint: path.join(importsDir, "full_torah_checkpoint.json"),
  };
}

function defaultCheckpoint(): RunCheckpoint {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    stages: {
      scrape: { status: "pending" },
      "import-hebrew": { status: "pending" },
      "import-targum": { status: "pending" },
      transpose: { status: "pending" },
      "post-verify": { status: "pending" },
    },
    transposeProgress: {},
  };
}

function readCheckpoint(file: string): RunCheckpoint {
  if (!fs.existsSync(file)) {
    return defaultCheckpoint();
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as RunCheckpoint;
  return raw.version === 1 ? raw : defaultCheckpoint();
}

function writeCheckpoint(file: string, checkpoint: RunCheckpoint): void {
  checkpoint.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

function markStage(checkpoint: RunCheckpoint, stage: keyof RunCheckpoint["stages"], detail?: string): void {
  checkpoint.stages[stage] = { status: "completed", completedAt: new Date().toISOString(), detail };
}

export function parseBooksArg(value?: string): TorahBookName[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => ensureTorahBook(x));
}

export function parseChaptersArg(value?: string): { start: number; end: number } | undefined {
  if (!value) return undefined;
  const [startRaw, endRaw] = value.split("-");
  const start = Number(startRaw);
  const end = Number(endRaw ?? startRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) {
    throw new Error(`Invalid --chapters value: ${value}`);
  }
  return { start, end };
}

export async function scrapeTorah(options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const books = selectedBooks(options.books);
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const useCache = options.useCache ?? true;

  const paths = outputPaths();
  fs.mkdirSync(paths.importsDir, { recursive: true });

  const hebrewLines: string[] = [];
  const targumLines: string[] = [];
  const mismatches: string[] = [];
  const bookSummaries: ScrapeManifest["books"] = [];

  for (const book of books) {
    const code = BOOK_CODE_BY_NAME.get(book);
    if (!code) {
      throw new Error(`Missing code for ${book}`);
    }

    const [heChapter1, arChapter1] = await Promise.all([
      fetchText(chapterUrl("he", code, 1), { retries, delayMs, cacheDir: paths.cacheDir, useCache }),
      fetchText(chapterUrl("ar", code, 1), { retries, delayMs, cacheDir: paths.cacheDir, useCache }),
    ]);

    const heCount = parseChapterCount(heChapter1, "he", code);
    const arCount = parseChapterCount(arChapter1, "ar", code);
    if (heCount !== arCount) {
      mismatches.push(`${book}: chapter count mismatch (he=${heCount}, ar=${arCount})`);
      continue;
    }

    const selected = selectedChapterNumbers(heCount, options.chapters);
    const chapterSummaries: ScrapeChapterSummary[] = [];

    for (const chapter of selected) {
      const hebrewUrl = chapterUrl("he", code, chapter);
      const aramaicUrl = chapterUrl("ar", code, chapter);
      const [heHtml, arHtml] = await Promise.all([
        fetchText(hebrewUrl, { retries, delayMs, cacheDir: paths.cacheDir, useCache }),
        fetchText(aramaicUrl, { retries, delayMs, cacheDir: paths.cacheDir, useCache }),
      ]);

      const heVerses = parseChapterVerses(heHtml, "he");
      const arVerses = parseChapterVerses(arHtml, "ar");

      assertContiguousVerses(book, chapter, heVerses);
      assertContiguousVerses(book, chapter, arVerses);

      if (heVerses.length !== arVerses.length) {
        mismatches.push(`${book}:${chapter} verse count mismatch (he=${heVerses.length}, ar=${arVerses.length})`);
      }

      for (let idx = 0; idx < Math.min(heVerses.length, arVerses.length); idx += 1) {
        const he = heVerses[idx];
        const ar = arVerses[idx];
        if (he.verse !== ar.verse) {
          mismatches.push(`${book}:${chapter} verse mismatch (he=${he.verse}, ar=${ar.verse})`);
          continue;
        }
        const verseId = `${book}:${chapter}:${he.verse}` as VerseId;
        hebrewLines.push(`${verseId}\t${he.text}`);
        targumLines.push(`${verseId}\t${ar.text}`);
      }

      chapterSummaries.push({
        chapter,
        hebrewUrl,
        aramaicUrl,
        hebrewVerseCount: heVerses.length,
        aramaicVerseCount: arVerses.length,
      });
    }

    bookSummaries.push({
      book,
      code,
      totalChapters: heCount,
      selectedChapters: selected,
      chapters: chapterSummaries,
    });
  }

  const manifest: ScrapeManifest = {
    runAt: new Date().toISOString(),
    options: {
      books,
      chapterRange: options.chapters,
      delayMs,
      retries,
      useCache,
    },
    books: bookSummaries,
    totals: {
      hebrewVerses: hebrewLines.length,
      aramaicVerses: targumLines.length,
    },
    mismatches,
    outputs: {
      hebrewTsvPath: paths.hebrewTsv,
      targumTsvPath: paths.targumTsv,
    },
  };

  if (mismatches.length > 0) {
    fs.writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    throw new Error(`Integrity checks failed. See ${paths.manifest}`);
  }

  const hebrewText = `${hebrewLines.join("\n")}\n`;
  const targumText = `${targumLines.join("\n")}\n`;
  fs.writeFileSync(paths.hebrewTsv, hebrewText, "utf8");
  fs.writeFileSync(paths.targumTsv, targumText, "utf8");

  manifest.outputs.hebrewSha256 = sha256(hebrewText);
  manifest.outputs.targumSha256 = sha256(targumText);
  fs.writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { hebrewLines, targumLines, manifest };
}

function loadManifestOrThrow(file: string): ScrapeManifest {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing scrape manifest: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as ScrapeManifest;
}

function shouldRunStage(checkpoint: RunCheckpoint, stage: keyof RunCheckpoint["stages"], force: boolean): boolean {
  if (force) return true;
  return checkpoint.stages[stage].status !== "completed";
}

function selectedVerseIdsFromRepo(
  repoIds: VerseId[],
  books: TorahBookName[],
  chapterRange?: { start: number; end: number },
): VerseId[] {
  return repoIds.filter((id) => {
    const parsed = parseVerseId(id);
    if (!books.includes(parsed.book as TorahBookName)) {
      return false;
    }
    if (chapterRange) {
      return parsed.chapter >= chapterRange.start && parsed.chapter <= chapterRange.end;
    }
    return true;
  });
}

export async function runTorahPipeline(options: RunOptions = {}): Promise<void> {
  const paths = outputPaths();
  const force = Boolean(options.force);
  const resume = options.resume ?? true;
  const checkpoint = force || !resume ? defaultCheckpoint() : readCheckpoint(paths.checkpoint);
  const books = selectedBooks(options.books);
  const chapterRange = options.chapters;
  const cfg = loadTransposeConfig();
  const repo = getRepository();

  if (shouldRunStage(checkpoint, "scrape", force)) {
    await scrapeTorah(options);
    markStage(checkpoint, "scrape");
    writeCheckpoint(paths.checkpoint, checkpoint);
  }

  const manifest = loadManifestOrThrow(paths.manifest);
  const hebrewTsv = fs.readFileSync(paths.hebrewTsv, "utf8");
  const targumTsv = fs.readFileSync(paths.targumTsv, "utf8");

  if (shouldRunStage(checkpoint, "import-hebrew", force)) {
    const importedHebrew = importHebrewLines(parseTsvLines(hebrewTsv));
    checkpoint.stats = { ...(checkpoint.stats ?? {}), importedHebrew };
    markStage(checkpoint, "import-hebrew", `Imported Hebrew verses: ${importedHebrew}`);
    writeCheckpoint(paths.checkpoint, checkpoint);
  }

  if (shouldRunStage(checkpoint, "import-targum", force)) {
    const importedTargum = importTargumLines(parseTsvLines(targumTsv));
    checkpoint.stats = { ...(checkpoint.stats ?? {}), importedTargum };
    markStage(checkpoint, "import-targum", `Imported Targum verses: ${importedTargum}`);
    writeCheckpoint(paths.checkpoint, checkpoint);
  }

  if (shouldRunStage(checkpoint, "transpose", force)) {
    let transposed = 0;

    for (const bookEntry of manifest.books) {
      if (!books.includes(bookEntry.book)) continue;
      const doneChapter = checkpoint.transposeProgress[bookEntry.book] ?? 0;
      for (const chapter of bookEntry.selectedChapters) {
        if (!force && chapter <= doneChapter) {
          continue;
        }
        if (chapterRange && (chapter < chapterRange.start || chapter > chapterRange.end)) {
          continue;
        }
        const verseIds = repo
          .listVerseIds()
          .filter((verseId) => verseId.startsWith(`${bookEntry.book}:${chapter}:`))
          .sort(compareVerseIdsCanonical);
        for (const verseId of verseIds) {
          const record = repo.getVerseRecord(verseId);
          if (!record) continue;
          repo.saveGenerated(verseId, generateForVerse(record.verse, cfg));
          transposed += 1;
        }
        checkpoint.transposeProgress[bookEntry.book] = chapter;
        checkpoint.stats = { ...(checkpoint.stats ?? {}), transposed };
        writeCheckpoint(paths.checkpoint, checkpoint);
      }
    }

    markStage(checkpoint, "transpose", `Transposed verses: ${transposed}`);
    writeCheckpoint(paths.checkpoint, checkpoint);
  }

  if (shouldRunStage(checkpoint, "post-verify", force)) {
    const allIds = selectedVerseIdsFromRepo(repo.listVerseIds(), books, chapterRange);
    const missingGenerated = allIds.filter((id) => {
      const record = repo.getVerseRecord(id);
      return !record || record.generated.length === 0;
    });
    checkpoint.stats = {
      ...(checkpoint.stats ?? {}),
      totalVerses: allIds.length,
      generatedVerses: allIds.length - missingGenerated.length,
      missingGenerated,
    };
    markStage(checkpoint, "post-verify", `Missing generated: ${missingGenerated.length}`);
    writeCheckpoint(paths.checkpoint, checkpoint);
  }

  console.log(
    JSON.stringify(
      {
        checkpoint: paths.checkpoint,
        stats: checkpoint.stats ?? {},
      },
      null,
      2,
    ),
  );
}

export function parseChapterVersesForTest(html: string, kind: "he" | "ar"): Array<{ verse: number; text: string }> {
  return parseChapterVerses(html, kind);
}
