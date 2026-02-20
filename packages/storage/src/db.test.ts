import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { Verse } from "@targum/core";
import { TargumRepository } from "./db.js";

const require = createRequire(import.meta.url);
const BetterSqlite3 = require("better-sqlite3") as new (filename: string) => {
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): {
    run(...args: unknown[]): void;
    all(): Array<{ name: string }>;
  };
};

function createTempRepo(): { repo: TargumRepository; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "targum-storage-test-"));
  const repo = new TargumRepository({
    dbPath: path.join(root, "app.db"),
    dataDir: root,
    author: "test-user",
  });
  return { repo, root };
}

function sampleVerse(id: `${string}:${number}:${number}` = "Genesis:1:1"): Verse {
  return {
    id,
    hebrewTokens: [
      {
        tokenId: "he-1",
        surface: "בְּרֵאשִׁית",
        letters: [{ letterId: "he-1-1", baseChar: "ב", niqqud: ["ּ"], taamim: [] }],
      },
    ],
    aramaicTokens: [
      {
        tokenId: "ar-1",
        surface: "בְּקַדְמִין",
        letters: [{ letterId: "ar-1-1", baseChar: "ב", niqqud: ["ּ"], taamim: [] }],
      },
    ],
  };
}

describe("TargumRepository flagged state", () => {
  it("defaults flagged to false for newly inserted verse state", () => {
    const { repo, root } = createTempRepo();
    try {
      repo.upsertVerse(sampleVerse("Genesis:1:1"));
      const record = repo.getVerseRecord("Genesis:1:1");
      expect(record).toBeTruthy();
      expect(record?.state.flagged).toBe(false);
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists flagged updates through setFlagged", () => {
    const { repo, root } = createTempRepo();
    try {
      repo.upsertVerse(sampleVerse("Genesis:1:2"));
      repo.setFlagged("Genesis:1:2", true);
      expect(repo.getVerseRecord("Genesis:1:2")?.state.flagged).toBe(true);

      repo.setFlagged("Genesis:1:2", false);
      expect(repo.getVerseRecord("Genesis:1:2")?.state.flagged).toBe(false);
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("migrates existing verse_state table by adding flagged column", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "targum-storage-migrate-test-"));
    const dbPath = path.join(root, "app.db");
    const db = new BetterSqlite3(dbPath);
    db.exec(`
      CREATE TABLE verses (
        verse_id TEXT PRIMARY KEY,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        hebrew_json TEXT NOT NULL,
        aramaic_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE generated_taamim (
        verse_id TEXT PRIMARY KEY,
        taam_json TEXT NOT NULL,
        confidence_json TEXT NOT NULL,
        algo_version TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE patches (
        id TEXT PRIMARY KEY,
        verse_id TEXT NOT NULL,
        op_json TEXT NOT NULL,
        author TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        seq_no INTEGER NOT NULL
      );
      CREATE TABLE verse_state (
        verse_id TEXT PRIMARY KEY,
        verified INTEGER NOT NULL DEFAULT 0,
        manuscript_notes TEXT NOT NULL DEFAULT '',
        patch_cursor INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
    db.close();

    const repo = new TargumRepository({
      dbPath,
      dataDir: root,
      author: "test-user",
    });

    try {
      const migratedDb = new BetterSqlite3(dbPath);
      const columns = migratedDb.prepare("PRAGMA table_info(verse_state)").all();
      migratedDb.close();
      expect(columns.some((column) => column.name === "flagged")).toBe(true);

      repo.upsertVerse(sampleVerse("Genesis:1:3"));
      expect(repo.getVerseRecord("Genesis:1:3")?.state.flagged).toBe(false);
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("TargumRepository manuscript foundations", () => {
  it("creates manuscript tables and indexes", () => {
    const { repo, root } = createTempRepo();
    const db = new BetterSqlite3(path.join(root, "app.db"));
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name);
      expect(tables).toContain("witnesses");
      expect(tables).toContain("pages");
      expect(tables).toContain("page_regions");
      expect(tables).toContain("ocr_jobs");
      expect(tables).toContain("witness_verses");
      expect(tables).toContain("working_verse_text");
      expect(tables).toContain("base_text_patches");
      expect(tables).toContain("manuscript_run_state");
      expect(tables).toContain("manuscript_run_audit");
      expect(tables).toContain("manuscript_fetch_runs");

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all()
        .map((row) => row.name);
      expect(indexes).toContain("idx_witness_verses_verse_id");
      expect(indexes).toContain("idx_witness_verses_witness_id");
      expect(indexes).toContain("idx_page_regions_page_id");
    } finally {
      db.close();
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("upserts witnesses and imports directory pages", () => {
    const { repo, root } = createTempRepo();
    try {
      const witness = repo.upsertWitness({
        id: "hebrewbooks_45803",
        name: "Lisbon 45803",
        type: "scanned_images",
        authorityWeight: 0.75,
        sourcePriority: 3,
      });
      expect(witness.id).toBe("hebrewbooks_45803");

      const sourceDir = path.join(root, "sources");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "001.png"), "png");
      fs.writeFileSync(path.join(sourceDir, "002.pdf"), "pdf");
      fs.writeFileSync(path.join(sourceDir, "ignore.txt"), "txt");

      const imported = repo.importPagesFromDirectory({ witnessId: witness.id, directoryPath: sourceDir });
      expect(imported.imported).toBe(2);
      expect(imported.pages).toHaveLength(2);
      expect(imported.pages[0].status).toBe("ok");
      expect(imported.pages[1].status).toBe("partial");

      const importedOffset = repo.importPagesFromDirectory({
        witnessId: witness.id,
        directoryPath: sourceDir,
        startIndex: 5,
      });
      expect(importedOffset.pages.some((page) => page.pageIndex === 5)).toBe(true);
      expect(importedOffset.pages.some((page) => page.pageIndex === 6)).toBe(true);
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stores regions and computes witness progress counters", () => {
    const { repo, root } = createTempRepo();
    try {
      const witness = repo.upsertWitness({
        id: "vatican_ms_448",
        name: "Biblia Vetus Testamentum Pentateuchus",
        type: "scanned_images",
        authorityWeight: 1,
        sourcePriority: 1,
      });
      const sourceDir = path.join(root, "sources");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "001.png"), "png");
      fs.writeFileSync(path.join(sourceDir, "002.png"), "png");
      const imported = repo.importPagesFromDirectory({ witnessId: witness.id, directoryPath: sourceDir });

      const page = imported.pages[0];
      repo.upsertPageRegion({
        pageId: page.id,
        regionIndex: 1,
        bbox: { x: 10, y: 20, w: 100, h: 200 },
        startVerseId: "Genesis:1:1",
        endVerseId: "Genesis:1:5",
        status: "ok",
      });

      const regions = repo.listRegionsByPage(page.id);
      expect(regions).toHaveLength(1);
      expect(regions[0].startVerseId).toBe("Genesis:1:1");

      const progress = repo.getWitnessProgress(witness.id);
      expect(progress.totalPages).toBe(2);
      expect(progress.pagesAnnotated).toBe(1);
      expect(progress.regionsPendingOcr).toBe(1);
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists base text patch history with undo/redo", () => {
    const { repo, root } = createTempRepo();
    try {
      repo.upsertVerse(sampleVerse("Genesis:1:10"));
      repo.addBaseTextPatch({
        verseId: "Genesis:1:10",
        patchType: "APPLY_WITNESS_READING",
        payload: {
          selectedSource: "vatican_ms_448",
          selectedTextNormalized: "foo",
          selectedTextSurface: "foo",
          ensembleConfidence: 0.8,
          flags: [],
          reasonCodes: ["TEST"],
        },
      });

      repo.addBaseTextPatch({
        verseId: "Genesis:1:10",
        patchType: "MANUAL_TEXT_EDIT",
        payload: {
          selectedSource: "manual",
          selectedTextNormalized: "bar",
          selectedTextSurface: "bar",
          ensembleConfidence: 0.9,
          flags: [],
          reasonCodes: ["TEST_EDIT"],
        },
      });

      expect(repo.getWorkingVerseText("Genesis:1:10")?.selectedTextSurface).toBe("bar");
      repo.undoBaseText("Genesis:1:10");
      expect(repo.getWorkingVerseText("Genesis:1:10")?.selectedTextSurface).toBe("foo");
      repo.redoBaseText("Genesis:1:10");
      expect(repo.getWorkingVerseText("Genesis:1:10")?.selectedTextSurface).toBe("bar");
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("tracks OCR jobs and retries safely", () => {
    const { repo, root } = createTempRepo();
    try {
      const witness = repo.upsertWitness({
        id: "hb_test",
        name: "HB Test",
        type: "scanned_images",
        authorityWeight: 0.7,
      });
      const sourceDir = path.join(root, "sources");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "001.png"), "png");
      const imported = repo.importPagesFromDirectory({ witnessId: witness.id, directoryPath: sourceDir });
      const region = repo.upsertPageRegion({
        pageId: imported.pages[0].id,
        regionIndex: 1,
        bbox: { x: 0, y: 0, w: 100, h: 100 },
        startVerseId: "Genesis:1:1",
        endVerseId: "Genesis:1:1",
      });

      const job = repo.createOcrJob(region.id);
      expect(job.status).toBe("queued");
      repo.updateOcrJobStatus(job.id, "running");
      const running = repo.getOcrJob(job.id);
      expect(running?.attempts).toBe(1);
      repo.updateOcrJobStatus(job.id, "failed", "boom");
      const failed = repo.getOcrJob(job.id);
      expect(failed?.status).toBe("failed");
      expect(failed?.error).toBe("boom");
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stores source attribution for taam patch history", () => {
    const { repo, root } = createTempRepo();
    try {
      repo.upsertVerse(sampleVerse("Genesis:1:12"));
      repo.saveGenerated("Genesis:1:12", [
        {
          taamId: "t1",
          name: "TIPEHA",
          unicodeMark: "\u0596",
          tier: "CONJUNCTIVE",
          position: { tokenIndex: 0, letterIndex: 0 },
          confidence: 0.8,
          reasons: ["seed"],
        },
      ]);

      repo.addPatch(
        "Genesis:1:12",
        { type: "DELETE_TAAM", taamId: "t1" },
        "test-note",
        "reviewer-a",
        { sourceType: "automation", sourceWitnessId: "vatican_ms_448" },
      );
      const record = repo.getVerseRecord("Genesis:1:12");
      expect(record?.patches).toHaveLength(1);
      expect(record?.patches[0].sourceType).toBe("automation");
      expect(record?.patches[0].sourceWitnessId).toBe("vatican_ms_448");
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists per-stage run state and blockers", () => {
    const { repo, root } = createTempRepo();
    try {
      repo.upsertWitness({
        id: "priority_p1",
        name: "Priority P1",
        type: "scanned_images",
        authorityWeight: 1,
        sourcePriority: 1,
      });
      repo.setWitnessRunStage({
        witnessId: "priority_p1",
        stage: "ocr",
        status: "blocked",
        blockers: [
          {
            stage: "ocr",
            blockerWitnessId: "other",
            blockerPriority: 0,
            reasonCode: "TEST_BLOCK",
            detail: "blocked",
          },
        ],
        actor: "tester",
      });

      const state = repo.getWitnessRunState("priority_p1");
      expect(state.ocrStatus).toBe("blocked");
      expect(state.blockers[0]?.reasonCode).toBe("TEST_BLOCK");
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("tracks automation feedback precision/recall metrics", () => {
    const { repo, root } = createTempRepo();
    try {
      const witness = repo.upsertWitness({
        id: "feedback_witness",
        name: "Feedback Witness",
        type: "scanned_images",
        authorityWeight: 1,
      });
      const sourceDir = path.join(root, "feedback-source");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "001.png"), "png");
      const imported = repo.importPagesFromDirectory({ witnessId: witness.id, directoryPath: sourceDir });

      repo.addAutomationFeedback({
        pageId: imported.pages[0].id,
        proposalType: "ranges",
        proposalId: "p1",
        accepted: true,
        confidence: 0.9,
        hasGroundTruth: true,
      });
      repo.addAutomationFeedback({
        pageId: imported.pages[0].id,
        proposalType: "ranges",
        proposalId: "p2",
        accepted: false,
        confidence: 0.4,
        hasGroundTruth: true,
      });

      const metrics = repo.getAutomationMetrics("ranges");
      expect(metrics.total).toBe(2);
      expect(metrics.accepted).toBe(1);
      expect(metrics.rejected).toBe(1);
      expect(metrics.precision).toBeGreaterThanOrEqual(0);
      expect(metrics.recall).toBeGreaterThanOrEqual(0);
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stores manuscript fetch run audit entries", () => {
    const { repo, root } = createTempRepo();
    try {
      repo.upsertWitness({
        id: "vatican_vetus_p1",
        name: "Biblia Vetus",
        type: "scanned_images",
        authorityWeight: 1,
        sourcePriority: 1,
      });

      repo.addManuscriptFetchRun({
        witnessId: "vatican_vetus_p1",
        sourceLink: "https://digi.vatlib.it/view/MSS_Vat.ebr.448",
        manifestUrl: "https://digi.vatlib.it/iiif/MSS_Vat.ebr.448/manifest.json",
        status: "completed",
        pageCount: 20,
      });
      repo.addManuscriptFetchRun({
        witnessId: "vatican_vetus_p1",
        sourceLink: "https://digi.vatlib.it/view/MSS_Vat.ebr.448",
        status: "failed",
        pageCount: 0,
        error: "HTTP 404",
      });

      const runs = repo.listManuscriptFetchRuns("vatican_vetus_p1");
      expect(runs).toHaveLength(2);
      const statuses = runs.map((run) => run.status).sort();
      expect(statuses).toEqual(["completed", "failed"]);
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("shows improving automation precision after accepted ground-truth samples", () => {
    const { repo, root } = createTempRepo();
    try {
      const witness = repo.upsertWitness({
        id: "precision_witness",
        name: "Precision Witness",
        type: "scanned_images",
        authorityWeight: 1,
      });
      const sourceDir = path.join(root, "precision-source");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "001.png"), "png");
      const imported = repo.importPagesFromDirectory({ witnessId: witness.id, directoryPath: sourceDir });
      const pageId = imported.pages[0].id;

      repo.addAutomationFeedback({
        pageId,
        proposalType: "blocks",
        proposalId: "seed-bad",
        accepted: false,
        confidence: 0.2,
        hasGroundTruth: true,
      });
      const before = repo.getAutomationMetrics("blocks").precision;

      repo.addAutomationFeedback({
        pageId,
        proposalType: "blocks",
        proposalId: "seed-good",
        accepted: true,
        confidence: 0.95,
        hasGroundTruth: true,
      });
      const after = repo.getAutomationMetrics("blocks").precision;
      expect(after).toBeGreaterThan(before);
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps exports byte-stable across repeated runs", () => {
    const { repo, root } = createTempRepo();
    try {
      repo.upsertVerse(sampleVerse("Genesis:1:1"));
      repo.saveGenerated("Genesis:1:1", [
        {
          taamId: "t1",
          name: "TIPEHA",
          unicodeMark: "\u0596",
          tier: "CONJUNCTIVE",
          position: { tokenIndex: 0, letterIndex: 0 },
          confidence: 0.8,
          reasons: ["seed"],
        },
      ]);
      repo.addPatch("Genesis:1:1", { type: "DELETE_TAAM", taamId: "t1" }, "remove");

      const jsonA = JSON.stringify(repo.exportJson());
      const jsonB = JSON.stringify(repo.exportJson());
      expect(jsonA).toBe(jsonB);

      const unicodeRenderer = (record: any) =>
        JSON.stringify({
          verseId: record.verse.id,
          state: record.state.patchCursor,
          generatedCount: record.generated.length,
          patchCount: record.patches.length,
        });

      const unicodeA = repo.exportUnicode(unicodeRenderer);
      const unicodeB = repo.exportUnicode(unicodeRenderer);
      expect(unicodeA).toBe(unicodeB);
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
