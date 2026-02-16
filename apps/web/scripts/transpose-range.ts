import { generateForVerse } from "@targum/core";
import { loadTransposeConfig } from "../lib/config";
import { getRepository } from "../lib/repository";

function parseRange(range: string): { start: string; end: string } {
  const [start, end] = range.split("-");
  return { start, end: end ?? start };
}

const arg = process.argv.find((a) => a.startsWith("--range="));
if (!arg) {
  console.error("Usage: pnpm transpose --range=Genesis:1:1-Genesis:1:31");
  process.exit(1);
}

const { start, end } = parseRange(arg.replace("--range=", ""));
const repo = getRepository();
const cfg = loadTransposeConfig();

let count = 0;
for (const verseId of repo.listVerseIds()) {
  if (verseId >= start && verseId <= end) {
    const record = repo.getVerseRecord(verseId);
    if (!record) continue;
    repo.saveGenerated(verseId, generateForVerse(record.verse, cfg));
    count += 1;
  }
}

console.log(`Transposed verses: ${count}`);
