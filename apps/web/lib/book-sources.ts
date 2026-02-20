import fs from "node:fs";
import path from "node:path";
import { MANUSCRIPT_WITNESS_IDS } from "@targum/core";
import { getRepository } from "./repository";

export interface BookSourceRow {
  referenceName: string;
  link: string;
  fileName: string;
  location: string;
  year: number | null;
  priority: number;
}

function getBookListPath(): string {
  const cwd = process.cwd();
  const webSuffix = `${path.sep}apps${path.sep}web`;
  const root = cwd.endsWith(webSuffix) ? path.resolve(cwd, "../..") : cwd;
  return path.join(root, "book_sources", "book_list.csv");
}

function toWitnessId(referenceName: string, priority: number): string {
  if (priority === 1) return MANUSCRIPT_WITNESS_IDS.vaticanMs448;
  if (priority === 2) return MANUSCRIPT_WITNESS_IDS.vaticanMs19;
  const normalized = referenceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `hebrewbooks_${normalized || priority}`;
}

function authorityWeightForPriority(priority: number): number {
  if (priority === 1) return 1;
  if (priority === 2) return 0.95;
  return Math.max(0.5, 0.9 - priority * 0.03);
}

export function readBookSources(): BookSourceRow[] {
  const filePath = getBookListPath();
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) return [];

  const rows: BookSourceRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((col) => col.trim());
    if (cols.length < 6) continue;
    rows.push({
      referenceName: cols[0],
      link: cols[1],
      fileName: cols[2],
      location: cols[3],
      year: Number.isFinite(Number(cols[4])) ? Number(cols[4]) : null,
      priority: Number(cols[5]),
    });
  }
  return rows.sort((a, b) => a.priority - b.priority);
}

export function syncWitnessesFromBookList(): { createdOrUpdated: number } {
  const repo = getRepository();
  const sources = readBookSources();
  for (const source of sources) {
    const witnessId = toWitnessId(source.referenceName, source.priority);
    repo.upsertWitness({
      id: witnessId,
      name: source.referenceName,
      type: "scanned_images",
      authorityWeight: authorityWeightForPriority(source.priority),
      sourcePriority: source.priority,
      sourceLink: source.link,
      sourceFileName: source.fileName === "NA" ? null : source.fileName,
      location: source.location,
      year: source.year,
      notes: "",
      coverage: "",
      metadata: {
        importPriority: source.priority,
      },
    });
  }

  repo.upsertWitness({
    id: MANUSCRIPT_WITNESS_IDS.baselineDigital,
    name: "Baseline Digital Aramaic",
    type: "digital_text",
    authorityWeight: 0.45,
    sourcePriority: null,
    notes: "Fallback source when scanned witnesses are unavailable or low-confidence.",
    coverage: "Existing imported corpus",
    metadata: { role: "fallback" },
  });

  return { createdOrUpdated: sources.length + 1 };
}
