import { getRepository } from "../lib/repository";
import { bootstrapPriorityWitnesses } from "../lib/manuscripts-import";

function main() {
  const repo = getRepository();
  const result = bootstrapPriorityWitnesses(repo);
  console.log(
    JSON.stringify(
      {
        ok: true,
        createdOrUpdated: result.createdOrUpdated,
        witnessIds: result.witnessIds,
      },
      null,
      2,
    ),
  );
}

main();
