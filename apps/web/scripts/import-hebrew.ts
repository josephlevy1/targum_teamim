import fs from "node:fs";
import { importHebrewLines, parseTsvLines } from "../lib/import";

const fileArg = process.argv.find((arg) => arg.startsWith("--file=")) ?? "";
const file = fileArg.replace("--file=", "");

if (!file) {
  console.error("Usage: pnpm import:hebrew --file=/absolute/path/input.tsv");
  process.exit(1);
}

const content = fs.readFileSync(file, "utf8");
const imported = importHebrewLines(parseTsvLines(content));
console.log(`Imported Hebrew verses: ${imported}`);
