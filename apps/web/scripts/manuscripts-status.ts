import { getRepository } from "../lib/repository";

function getArg(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.split("=").slice(1).join("=");
}

function main() {
  const witnessId = getArg("--witness");
  if (!witnessId) {
    throw new Error("--witness=<id> is required");
  }

  const repo = getRepository();
  const witness = repo.getWitness(witnessId);
  if (!witness) {
    throw new Error(`Witness not found: ${witnessId}`);
  }

  const runState = repo.getWitnessRunState(witnessId);
  const progress = repo.getWitnessProgress(witnessId);
  const fetchRuns = repo.listManuscriptFetchRuns(witnessId);

  console.log(
    JSON.stringify(
      {
        witness: {
          id: witness.id,
          name: witness.name,
          sourcePriority: witness.sourcePriority,
        },
        runState,
        progress,
        latestFetchRun: fetchRuns[0] ?? null,
      },
      null,
      2,
    ),
  );
}

main();
