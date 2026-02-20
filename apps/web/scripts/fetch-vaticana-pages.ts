import path from "node:path";
import { getRepository } from "../lib/repository";
import { downloadVaticanaPages } from "../lib/manuscripts-vaticana";
import { witnessRawPagesDir } from "../lib/manuscripts-import";

function getArg(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const witnessId = getArg("--witness");
  if (!witnessId) {
    throw new Error("--witness=<id> is required");
  }

  const startPage = Math.max(1, Number(getArg("--start-page") ?? 1));
  const pageCount = Math.max(1, Number(getArg("--page-count") ?? 20));
  const manifestUrl = getArg("--manifest-url");

  const repo = getRepository();
  const witness = repo.getWitness(witnessId);
  if (!witness) {
    throw new Error(`Witness not found: ${witnessId}. Run manuscripts:bootstrap first.`);
  }
  if (!witness.sourceLink) {
    throw new Error(`Witness ${witnessId} is missing source_link.`);
  }

  const outDir = path.resolve(witnessRawPagesDir(witnessId), "..");
  const sourceLink = witness.sourceLink;

  try {
    const result = await downloadVaticanaPages({
      witnessId,
      sourceLink,
      startPage,
      pageCount,
      outDir,
      manifestUrl,
    });

    repo.addManuscriptFetchRun({
      witnessId,
      sourceLink,
      status: "completed",
      pageCount: result.fetchedPages.length,
      manifestUrl: result.manifestUrl,
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          witnessId,
          fetchedPages: result.fetchedPages.length,
          rawPagesDir: result.rawPagesDir,
          fetchManifestPath: result.fetchManifestPath,
          manifestUrl: result.manifestUrl,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    repo.addManuscriptFetchRun({
      witnessId,
      sourceLink,
      status: "failed",
      pageCount: 0,
      manifestUrl: manifestUrl ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
