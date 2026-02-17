import { parseBooksArg, parseChaptersArg, runTorahPipeline } from "../lib/torah-pipeline";

function getArg(name: string): string | undefined {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return raw?.slice(name.length + 1);
}

async function main() {
  await runTorahPipeline({
    books: parseBooksArg(getArg("--books")),
    chapters: parseChaptersArg(getArg("--chapters")),
    delayMs: getArg("--delay-ms") ? Number(getArg("--delay-ms")) : undefined,
    retries: getArg("--retries") ? Number(getArg("--retries")) : undefined,
    useCache: !process.argv.includes("--no-cache"),
    resume: process.argv.includes("--resume"),
    force: process.argv.includes("--force"),
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
