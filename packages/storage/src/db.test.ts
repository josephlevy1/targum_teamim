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
});
