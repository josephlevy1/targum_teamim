import { compareVerseIdsCanonical } from "@targum/core";
import { getRepository } from "../lib/repository";
import { backfillWitnessFromRemapRange } from "../lib/manuscripts-pipeline";

type Args = {
  includeCalibration: boolean;
  witnesses?: Set<string>;
};

function parseArgs(argv: string[]): Args {
  const includeCalibration = argv.includes("--include-calibration");
  const witnessArg = argv.find((arg) => arg.startsWith("--witnesses="))?.split("=").slice(1).join("=");
  const witnesses = witnessArg
    ? new Set(
        witnessArg
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      )
    : undefined;
  return { includeCalibration, witnesses };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = getRepository();
  const verseIds = repo.listVerseIds().sort(compareVerseIdsCanonical);
  const verseCount = verseIds.length;
  if (verseCount === 0) throw new Error("No verses in repository.");

  const witnesses = repo
    .listWitnesses()
    .filter((w) => (w.sourcePriority ?? 0) >= 1 && (w.sourcePriority ?? 99) <= 12)
    .filter((w) => (args.includeCalibration ? true : !w.id.startsWith("calibration_")))
    .filter((w) => (args.witnesses ? args.witnesses.has(w.id) : true))
    .sort((a, b) => {
      const p = (a.sourcePriority ?? 99) - (b.sourcePriority ?? 99);
      return p !== 0 ? p : a.id.localeCompare(b.id);
    });

  if (witnesses.length === 0) {
    throw new Error("No witnesses selected.");
  }

  const summary: Array<Record<string, unknown>> = [];

  for (const witness of witnesses) {
    const pages = repo.listPagesByWitness(witness.id).sort((a, b) => a.pageIndex - b.pageIndex);
    if (pages.length === 0) {
      summary.push({ witnessId: witness.id, priority: witness.sourcePriority, pages: 0, regionsRetagged: 0, versesTouched: 0, skipped: true });
      continue;
    }

    let regionsRetagged = 0;
    const pageCount = pages.length;
    for (let pageIdx = 0; pageIdx < pageCount; pageIdx += 1) {
      const page = pages[pageIdx];
      const pageRegions = repo.listRegionsByPage(page.id).sort((a, b) => a.regionIndex - b.regionIndex);
      if (pageRegions.length === 0) continue;

      const globalStart = Math.floor((pageIdx * verseCount) / pageCount);
      const globalEndExclusive = Math.floor(((pageIdx + 1) * verseCount) / pageCount);
      const pageStart = Math.max(0, Math.min(verseCount - 1, globalStart));
      const pageEnd = Math.max(pageStart, Math.min(verseCount - 1, globalEndExclusive - 1));

      for (let regionIdx = 0; regionIdx < pageRegions.length; regionIdx += 1) {
        const region = pageRegions[regionIdx];
        const rStart = pageStart + Math.floor(((pageEnd - pageStart + 1) * regionIdx) / pageRegions.length);
        const rEndExclusive = pageStart + Math.floor(((pageEnd - pageStart + 1) * (regionIdx + 1)) / pageRegions.length);
        const rEnd = Math.max(rStart, Math.min(pageEnd, rEndExclusive - 1));

        repo.upsertPageRegion({
          id: region.id,
          pageId: region.pageId,
          regionIndex: region.regionIndex,
          bbox: region.bbox,
          startVerseId: verseIds[rStart],
          endVerseId: verseIds[rEnd],
          remapMethod: "seq-page-proportional-v1",
          remapConfidence: null,
          remapCandidates: [],
          remapReviewRequired: false,
          status: region.status,
          notes: `${region.notes} | retag: seq-page-proportional-v1`,
        });
        regionsRetagged += 1;
      }
    }

    const backfill = await backfillWitnessFromRemapRange({ witnessId: witness.id });

    const row = {
      witnessId: witness.id,
      priority: witness.sourcePriority,
      pages: pages.length,
      regionsRetagged,
      regionsBackfilled: backfill.regions,
      versesTouched: backfill.versesTouched,
    };
    summary.push(row);
    console.log(JSON.stringify({ event: "witness_completed", ...row }));
  }

  const payload = {
    event: "full_alignment_expand_completed",
    selectedWitnesses: witnesses.map((w) => w.id),
    selectedCount: witnesses.length,
    summary,
  };
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
