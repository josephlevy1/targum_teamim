import type { RunBlocker, RunStage, WitnessRecord } from "@targum/storage";
import type { TargumRepository } from "@targum/storage";
import { getRepository } from "./repository";

export interface GateEvaluation {
  allowed: boolean;
  blockers: RunBlocker[];
  witness: WitnessRecord;
  stage: RunStage;
  overrideUsed: boolean;
}

function priorityWitnesses(repo: TargumRepository): WitnessRecord[] {
  return repo
    .listWitnesses()
    .filter((w) => Number.isInteger(w.sourcePriority) && (w.sourcePriority ?? 0) > 0)
    .sort((a, b) => (a.sourcePriority ?? 99) - (b.sourcePriority ?? 99));
}

function stageStatusField(stage: RunStage): "ingestStatus" | "ocrStatus" | "splitStatus" | "confidenceStatus" {
  if (stage === "ingest") return "ingestStatus";
  if (stage === "ocr") return "ocrStatus";
  if (stage === "split") return "splitStatus";
  return "confidenceStatus";
}

export function evaluateSourceGate(input: {
  witnessId: string;
  stage: RunStage;
  adminOverride?: boolean;
  actor?: string;
  note?: string;
}, repository?: TargumRepository): GateEvaluation {
  const repo = repository ?? getRepository();
  const witnesses = priorityWitnesses(repo);
  const witness = witnesses.find((w) => w.id === input.witnessId) ?? repo.getWitness(input.witnessId);
  if (!witness) throw new Error(`Witness not found: ${input.witnessId}`);

  if (!witness.sourcePriority) {
    return { allowed: true, blockers: [], witness, stage: input.stage, overrideUsed: false };
  }

  const field = stageStatusField(input.stage);
  const blockers: RunBlocker[] = [];
  for (const higher of witnesses) {
    if ((higher.sourcePriority ?? 999) >= witness.sourcePriority) continue;
    const higherState = repo.getWitnessRunState(higher.id);
    const status = higherState[field];
    if (status !== "completed") {
      blockers.push({
        stage: input.stage,
        blockerWitnessId: higher.id,
        blockerPriority: higher.sourcePriority ?? 0,
        reasonCode: `P${higher.sourcePriority}_${input.stage.toUpperCase()}_${status.toUpperCase()}`,
        detail: `Priority P${higher.sourcePriority} (${higher.name}) must complete ${input.stage} before this witness can proceed.`,
      });
    }
  }

  if (blockers.length > 0 && !input.adminOverride) {
    repo.setWitnessRunStage({
      witnessId: input.witnessId,
      stage: input.stage,
      status: "blocked",
      blockers,
      actor: input.actor,
      note: input.note ?? "blocked by priority gate",
      overrideUsed: false,
    });
    return { allowed: false, blockers, witness, stage: input.stage, overrideUsed: false };
  }

  repo.setWitnessRunStage({
    witnessId: input.witnessId,
    stage: input.stage,
    status: "running",
    blockers,
    actor: input.actor,
    note: blockers.length > 0 ? "admin override used" : input.note,
    overrideUsed: Boolean(blockers.length > 0 && input.adminOverride),
  });

  return {
    allowed: true,
    blockers,
    witness,
    stage: input.stage,
    overrideUsed: Boolean(blockers.length > 0 && input.adminOverride),
  };
}

export function markStageCompleted(witnessId: string, stage: RunStage, actor?: string, note?: string) {
  const repo = getRepository();
  return repo.setWitnessRunStage({
    witnessId,
    stage,
    status: "completed",
    blockers: [],
    actor,
    note,
  });
}

export function markStageFailed(witnessId: string, stage: RunStage, error: string, actor?: string) {
  const repo = getRepository();
  return repo.setWitnessRunStage({
    witnessId,
    stage,
    status: "failed",
    blockers: [],
    actor,
    note: error,
  });
}

export function getSourceGateSnapshot() {
  const repo = getRepository();
  return priorityWitnesses(repo).map((witness) => ({
    witness,
    runState: repo.getWitnessRunState(witness.id),
  }));
}
