import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TargumRepository } from "@targum/storage";
import { evaluateSourceGate } from "./manuscripts-gating";

function createTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gating-web-test-"));
  const repo = new TargumRepository({
    dbPath: path.join(root, "app.db"),
    dataDir: root,
    author: "tester",
  });
  return { root, repo };
}

describe("manuscript gating policy evaluator", () => {
  it("blocks for every non-completed higher-priority status", () => {
    const statuses = ["pending", "running", "failed", "blocked"] as const;
    for (const status of statuses) {
      const { root, repo } = createTempRepo();
      try {
        repo.upsertWitness({
          id: "p1",
          name: "P1",
          type: "scanned_images",
          authorityWeight: 1,
          sourcePriority: 1,
          sourceLink: "https://example.org/p1",
        });
        repo.upsertWitness({
          id: "p2",
          name: "P2",
          type: "scanned_images",
          authorityWeight: 0.9,
          sourcePriority: 2,
          sourceLink: "https://example.org/p2",
        });
        repo.setWitnessRunStage({
          witnessId: "p1",
          stage: "ingest",
          status,
          blockers: [],
        });

        const gate = evaluateSourceGate({ witnessId: "p2", stage: "ingest" }, repo);
        expect(gate.allowed).toBe(false);
        expect(gate.blockers[0].reasonCode).toContain(`P1_INGEST_${status.toUpperCase()}`);
      } finally {
        repo.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("blocks lower priority when higher priority stage is pending", () => {
    const { root, repo } = createTempRepo();
    try {
      repo.upsertWitness({ id: "p1", name: "P1", type: "scanned_images", authorityWeight: 1, sourcePriority: 1, sourceLink: "https://example.org/p1" });
      repo.upsertWitness({ id: "p2", name: "P2", type: "scanned_images", authorityWeight: 0.9, sourcePriority: 2, sourceLink: "https://example.org/p2" });

      const gate = evaluateSourceGate({ witnessId: "p2", stage: "ocr" }, repo);
      expect(gate.allowed).toBe(false);
      expect(gate.blockers.length).toBe(1);
      expect(gate.blockers[0].reasonCode).toContain("P1_OCR_PENDING");
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("allows with admin override and records overrideUsed", () => {
    const { root, repo } = createTempRepo();
    try {
      repo.upsertWitness({ id: "p1", name: "P1", type: "scanned_images", authorityWeight: 1, sourcePriority: 1, sourceLink: "https://example.org/p1" });
      repo.upsertWitness({ id: "p2", name: "P2", type: "scanned_images", authorityWeight: 0.9, sourcePriority: 2, sourceLink: "https://example.org/p2" });

      const gate = evaluateSourceGate({ witnessId: "p2", stage: "split", adminOverride: true, actor: "admin" }, repo);
      expect(gate.allowed).toBe(true);
      expect(gate.overrideUsed).toBe(true);
      expect(gate.blockers.length).toBe(1);

      const runState = repo.getWitnessRunState("p2");
      expect(runState.splitStatus).toBe("running");
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects lower-priority confidence run while higher priority is failed", () => {
    const { root, repo } = createTempRepo();
    try {
      repo.upsertWitness({ id: "p1", name: "P1", type: "scanned_images", authorityWeight: 1, sourcePriority: 1, sourceLink: "https://example.org/p1" });
      repo.upsertWitness({ id: "p2", name: "P2", type: "scanned_images", authorityWeight: 0.9, sourcePriority: 2, sourceLink: "https://example.org/p2" });

      repo.setWitnessRunStage({
        witnessId: "p1",
        stage: "confidence",
        status: "failed",
        blockers: [],
      });

      const gate = evaluateSourceGate({ witnessId: "p2", stage: "confidence" }, repo);
      expect(gate.allowed).toBe(false);
      expect(gate.blockers[0].reasonCode).toContain("P1_CONFIDENCE_FAILED");
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("enforces sequential progression across P1 through P12", () => {
    const { root, repo } = createTempRepo();
    try {
      for (let i = 1; i <= 12; i += 1) {
        repo.upsertWitness({
          id: `p${i}`,
          name: `P${i}`,
          type: "scanned_images",
          authorityWeight: 1 - i * 0.01,
          sourcePriority: i,
          sourceLink: `https://example.org/p${i}`,
        });
      }

      for (let i = 2; i <= 12; i += 1) {
        const blocked = evaluateSourceGate({ witnessId: `p${i}`, stage: "ocr" }, repo);
        expect(blocked.allowed).toBe(false);
      }

      for (let i = 1; i <= 12; i += 1) {
        repo.setWitnessRunStage({
          witnessId: `p${i}`,
          stage: "ocr",
          status: "completed",
          blockers: [],
        });
        if (i < 12) {
          const gate = evaluateSourceGate({ witnessId: `p${i + 1}`, stage: "ocr" }, repo);
          expect(gate.allowed).toBe(true);
        }
      }
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
