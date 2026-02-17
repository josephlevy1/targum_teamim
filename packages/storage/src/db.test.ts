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
