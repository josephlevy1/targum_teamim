import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { TargumRepository, WitnessRecord } from "@targum/storage";
import { readBookSources, type BookSourceRow } from "./book-sources";

export const VATICAN_VETUS_WITNESS_ID = "vatican_vetus_p1";
export const VATICAN_EBR19_WITNESS_ID = "vatican_ebr19_p2";

export interface PriorityWitnessDefinition {
  id: string;
  source: BookSourceRow;
}

function resolveProjectRoot(): string {
  const cwd = process.cwd();
  const webSuffix = `${path.sep}apps${path.sep}web`;
  if (cwd.endsWith(webSuffix)) return path.resolve(cwd, "../..");
  return cwd;
}

export function getProjectRoot(): string {
  return resolveProjectRoot();
}

export function witnessIdForSource(source: BookSourceRow): string {
  if (source.priority === 1) return VATICAN_VETUS_WITNESS_ID;
  if (source.priority === 2) return VATICAN_EBR19_WITNESS_ID;

  const m = source.fileName.match(/Hebrewbooks_org_(\d+)\.pdf/i);
  if (m) return `hebrewbooks_${m[1]}`;

  const slug = source.referenceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `hebrewbooks_${slug || source.priority}`;
}

export function authorityWeightForPriority(priority: number): number {
  if (priority <= 1) return 1;
  if (priority === 2) return 0.95;
  return Math.max(0.5, 0.9 - priority * 0.03);
}

export function loadPriorityWitnessDefinitions(): PriorityWitnessDefinition[] {
  return readBookSources()
    .filter((source) => Number.isInteger(source.priority) && source.priority >= 1 && source.priority <= 12)
    .sort((a, b) => a.priority - b.priority)
    .map((source) => ({
      id: witnessIdForSource(source),
      source,
    }));
}

export function bootstrapPriorityWitnesses(repo: TargumRepository): {
  createdOrUpdated: number;
  witnessIds: string[];
} {
  const defs = loadPriorityWitnessDefinitions();
  const prioritySet = new Set<number>();
  const witnessIds: string[] = [];

  for (const def of defs) {
    prioritySet.add(def.source.priority);
    repo.upsertWitness({
      id: def.id,
      name: def.source.referenceName,
      type: "scanned_images",
      authorityWeight: authorityWeightForPriority(def.source.priority),
      sourcePriority: def.source.priority,
      sourceLink: def.source.link,
      sourceFileName: def.source.fileName === "NA" ? null : def.source.fileName,
      location: def.source.location,
      year: def.source.year,
      metadata: {
        importPriority: def.source.priority,
      },
    });
    witnessIds.push(def.id);
  }

  for (let priority = 1; priority <= 12; priority += 1) {
    if (!prioritySet.has(priority)) {
      throw new Error(`book_sources/book_list.csv is missing priority P${priority}.`);
    }
  }

  return {
    createdOrUpdated: defs.length,
    witnessIds,
  };
}

export function witnessRawPagesDir(witnessId: string): string {
  return path.join(getProjectRoot(), "data", "imports", "manuscripts", witnessId, "raw-pages");
}

export function witnessRunsDir(witnessId: string): string {
  return path.join(getProjectRoot(), "data", "imports", "manuscripts", witnessId, "runs");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function ensurePdftoppm(): void {
  const check = spawnSync("pdftoppm", ["-h"], { encoding: "utf8" });
  if (check.error || (check.status !== 0 && check.status !== 99 && check.status !== 1)) {
    throw new Error("pdftoppm is required to rasterize local Hebrewbooks PDFs.");
  }
}

function clearDirectory(dir: string): void {
  ensureDir(dir);
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function fileExtForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext || ".bin";
}

export function listSupportedPageFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const supported = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".pdf"]);
  return fs
    .readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .filter((filePath) => supported.has(path.extname(filePath).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

export function stageWindowPages(input: {
  sourceDir: string;
  outputDir: string;
  startPage: number;
  pageCount: number;
}): { stagedFiles: string[]; startIndex: number } {
  const files = listSupportedPageFiles(input.sourceDir);
  if (files.length === 0) {
    throw new Error(`No supported page files found in ${input.sourceDir}`);
  }

  const startIndex = Math.max(1, input.startPage);
  const requestedCount = Math.max(1, input.pageCount);
  const numberedEntries = files.map((filePath) => {
    const base = path.basename(filePath);
    const m = base.match(/(\d+)(?=\.[^.]+$)/);
    return {
      filePath,
      pageIndex: m ? Number(m[1]) : Number.NaN,
    };
  });
  const allNumbered = numberedEntries.every((entry) => Number.isFinite(entry.pageIndex));

  clearDirectory(input.outputDir);
  const staged: string[] = [];

  if (allNumbered) {
    const byIndex = new Map<number, string>();
    for (const entry of numberedEntries) {
      byIndex.set(entry.pageIndex, entry.filePath);
    }
    const maxIndex = Math.max(...numberedEntries.map((entry) => entry.pageIndex));
    if (!byIndex.has(startIndex)) {
      throw new Error(`start-page ${startIndex} exceeds available pages (${maxIndex}).`);
    }

    const endIndex = startIndex + requestedCount - 1;
    for (let pageIndex = startIndex; pageIndex <= endIndex; pageIndex += 1) {
      const sourceFile = byIndex.get(pageIndex);
      if (!sourceFile) break;
      const ext = fileExtForPath(sourceFile);
      const target = path.join(input.outputDir, `${String(pageIndex).padStart(4, "0")}${ext}`);
      fs.copyFileSync(sourceFile, target);
      staged.push(target);
    }
  } else {
    const endIndex = Math.min(files.length, startIndex + requestedCount - 1);
    if (startIndex > files.length) {
      throw new Error(`start-page ${startIndex} exceeds available pages (${files.length}).`);
    }

    for (let pageIndex = startIndex; pageIndex <= endIndex; pageIndex += 1) {
      const sourceFile = files[pageIndex - 1];
      const ext = fileExtForPath(sourceFile);
      const target = path.join(input.outputDir, `${String(pageIndex).padStart(4, "0")}${ext}`);
      fs.copyFileSync(sourceFile, target);
      staged.push(target);
    }
  }

  return {
    stagedFiles: staged,
    startIndex,
  };
}

export function materializeHebrewbooksPages(input: {
  witness: WitnessRecord;
  startPage: number;
  pageCount: number;
}): { rawPagesDir: string; pagesMaterialized: number } {
  if (!input.witness.sourceFileName) {
    throw new Error(`Witness ${input.witness.id} does not have source_file_name.`);
  }

  const root = getProjectRoot();
  const sourcePdf = path.join(root, "book_sources", input.witness.sourceFileName);
  if (!fs.existsSync(sourcePdf)) {
    throw new Error(`Expected local PDF missing: ${sourcePdf}`);
  }

  ensurePdftoppm();
  const rawDir = witnessRawPagesDir(input.witness.id);
  clearDirectory(rawDir);

  const start = Math.max(1, input.startPage);
  const count = Math.max(1, input.pageCount);
  const end = start + count - 1;

  let written = 0;
  for (let page = start; page <= end; page += 1) {
    const outBase = path.join(rawDir, `p${String(page).padStart(4, "0")}`);
    const run = spawnSync("pdftoppm", ["-f", String(page), "-l", String(page), "-singlefile", "-png", sourcePdf, outBase], {
      encoding: "utf8",
    });
    const outPath = `${outBase}.png`;
    if (run.status !== 0 || !fs.existsSync(outPath)) {
      if (written === 0) {
        throw new Error(`Failed to rasterize ${sourcePdf} page ${page}: ${run.stderr || "unknown error"}`);
      }
      break;
    }
    written += 1;
  }

  if (written === 0) {
    throw new Error(`No pages were materialized for ${input.witness.id}.`);
  }

  return {
    rawPagesDir: rawDir,
    pagesMaterialized: written,
  };
}
