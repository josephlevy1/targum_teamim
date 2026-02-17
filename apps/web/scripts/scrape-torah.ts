import { parseBooksArg, parseChaptersArg, scrapeTorah } from "../lib/torah-pipeline";

function getArg(name: string): string | undefined {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return raw?.slice(name.length + 1);
}

async function main() {
  const books = parseBooksArg(getArg("--books"));
  const chapters = parseChaptersArg(getArg("--chapters"));
  const delayMsRaw = getArg("--delay-ms");
  const retriesRaw = getArg("--retries");
  const useCache = !process.argv.includes("--no-cache");

  const result = await scrapeTorah({
    books,
    chapters,
    delayMs: delayMsRaw ? Number(delayMsRaw) : undefined,
    retries: retriesRaw ? Number(retriesRaw) : undefined,
    useCache,
  });

  console.log(
    JSON.stringify(
      {
        hebrewVerses: result.hebrewLines.length,
        targumVerses: result.targumLines.length,
        manifest: result.manifest.outputs,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
