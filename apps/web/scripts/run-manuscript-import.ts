import { parseImportArgs, runManuscriptImport } from "../lib/manuscripts-import-runner";

async function main() {
  const args = parseImportArgs(process.argv.slice(2));
  const summary = await runManuscriptImport(args);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
