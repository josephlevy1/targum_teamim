import fs from "node:fs";
import { importTargumLines, parseTsvLines } from "../lib/import";

const fileArg = process.argv.find((arg) => arg.startsWith("--file=")) ?? "";
const file = fileArg.replace("--file=", "");

if (!file) {
  console.error("Usage: pnpm import:targum --file=/absolute/path/input.tsv");
  process.exit(1);
}

const content = fs.readFileSync(file, "utf8");
const imported = importTargumLines(parseTsvLines(content));
console.log(`Imported Targum verses: ${imported}`);
