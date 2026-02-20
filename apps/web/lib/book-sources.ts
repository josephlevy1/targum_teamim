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

const FALLBACK_BOOK_SOURCES: BookSourceRow[] = [
  {
    referenceName: "Biblia Vetus Testamentum Pentateuchus",
    link: "https://digi.vatlib.it/view/MSS_Vat.ebr.448",
    fileName: "NA",
    location: "Spain",
    year: 1200,
    priority: 1,
  },
  {
    referenceName: "Vat.ebr.19",
    link: "https://digi.vatlib.it/view/MSS_Vat.ebr.19",
    fileName: "NA",
    location: "North Africa",
    year: 1500,
    priority: 2,
  },
  {
    referenceName: "Lisbon 45803",
    link: "https://www.hebrewbooks.org/45803",
    fileName: "Hebrewbooks_org_45803.pdf",
    location: "Lisbon",
    year: 1491,
    priority: 3,
  },
  {
    referenceName: "Venice 22405",
    link: "https://www.hebrewbooks.org/22405",
    fileName: "Hebrewbooks_org_22405.pdf",
    location: "Venice",
    year: 1518,
    priority: 4,
  },
  {
    referenceName: "Venice 42687",
    link: "https://www.hebrewbooks.org/42687",
    fileName: "Hebrewbooks_org_42687.pdf",
    location: "Venice",
    year: 1547,
    priority: 5,
  },
  {
    referenceName: "Chumash Sevyoniti",
    link: "https://www.hebrewbooks.org/21711",
    fileName: "Hebrewbooks_org_21711.pdf",
    location: "Sabbioneta",
    year: 1557,
    priority: 6,
  },
  {
    referenceName: "Sixth Biblia Rabbinica",
    link: "https://www.hebrewbooks.org/43164",
    fileName: "Hebrewbooks_org_43164.pdf",
    location: "Basel",
    year: 1618,
    priority: 7,
  },
  {
    referenceName: "Amsterdam 42117",
    link: "https://www.hebrewbooks.org/42117",
    fileName: "Hebrewbooks_org_42117.pdf",
    location: "Amsterdam",
    year: 1680,
    priority: 8,
  },
  {
    referenceName: "Amsterdam 42118",
    link: "https://www.hebrewbooks.org/42118",
    fileName: "Hebrewbooks_org_42118.pdf",
    location: "Amsterdam",
    year: 1682,
    priority: 9,
  },
  {
    referenceName: "Frankfurt 42329",
    link: "https://www.hebrewbooks.org/42329",
    fileName: "Hebrewbooks_org_42329.pdf",
    location: "Frankfurt",
    year: 1728,
    priority: 10,
  },
  {
    referenceName: "Amsterdam 42735",
    link: "https://www.hebrewbooks.org/42735",
    fileName: "Hebrewbooks_org_42735.pdf",
    location: "Amsterdam",
    year: 1749,
    priority: 11,
  },
  {
    referenceName: "Amsterdam 42071",
    link: "https://www.hebrewbooks.org/42071",
    fileName: "Hebrewbooks_org_42071.pdf",
    location: "Amsterdam",
    year: 1757,
    priority: 12,
  },
];

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
  if (!fs.existsSync(filePath)) {
    return [...FALLBACK_BOOK_SOURCES].sort((a, b) => a.priority - b.priority);
  }
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
