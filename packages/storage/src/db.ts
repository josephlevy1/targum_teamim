import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import type Database from "better-sqlite3";
import type { GeneratedTaam, PatchEntry, PatchOp, Verse, VerseId, VerseState } from "@targum/core";
import { applyPatchLog, compareVerseIdsCanonical, isVerseIdInRange } from "@targum/core";

const require = createRequire(path.join(process.cwd(), "package.json"));
const BetterSqlite3 = require("better-sqlite3") as new (filename: string) => Database.Database;

export interface RepositoryOptions {
  dbPath: string;
  dataDir: string;
  author: string;
}

export interface VerseRecord {
  verse: Verse;
  generated: GeneratedTaam[];
  patches: PatchEntry[];
  state: VerseState;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function versePath(baseDir: string, verseId: VerseId): string {
  const [book, chapter, verse] = verseId.split(":");
  return path.join(baseDir, "verses", book, chapter, `${verse}.json`);
}

function patchPath(baseDir: string, verseId: VerseId): string {
  const [book, chapter, verse] = verseId.split(":");
  return path.join(baseDir, "patches", book, chapter, `${verse}.patchlog.json`);
}

export class TargumRepository {
  private readonly db: Database.Database;

  constructor(private readonly options: RepositoryOptions) {
    ensureDir(path.dirname(options.dbPath));
    ensureDir(path.join(options.dataDir, "verses"));
    ensureDir(path.join(options.dataDir, "patches"));
    this.db = new BetterSqlite3(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS verses (
        verse_id TEXT PRIMARY KEY,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        hebrew_json TEXT NOT NULL,
        aramaic_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS generated_taamim (
        verse_id TEXT PRIMARY KEY,
        taam_json TEXT NOT NULL,
        confidence_json TEXT NOT NULL,
        algo_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (verse_id) REFERENCES verses(verse_id)
      );

      CREATE TABLE IF NOT EXISTS patches (
        id TEXT PRIMARY KEY,
        verse_id TEXT NOT NULL,
        op_json TEXT NOT NULL,
        author TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        seq_no INTEGER NOT NULL,
        FOREIGN KEY (verse_id) REFERENCES verses(verse_id)
      );

      CREATE TABLE IF NOT EXISTS verse_state (
        verse_id TEXT PRIMARY KEY,
        verified INTEGER NOT NULL DEFAULT 0,
        manuscript_notes TEXT NOT NULL DEFAULT '',
        patch_cursor INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (verse_id) REFERENCES verses(verse_id)
      );

      CREATE INDEX IF NOT EXISTS idx_patches_verse_seq ON patches(verse_id, seq_no);
    `);
  }

  close(): void {
    this.db.close();
  }

  upsertVerse(verse: Verse): void {
    const now = new Date().toISOString();
    const [book, chapter, number] = verse.id.split(":");

    const hebrewJson = JSON.stringify(verse.hebrewTokens);
    const aramaicJson = JSON.stringify(verse.aramaicTokens);

    this.db
      .prepare(
        `
      INSERT INTO verses (verse_id, book, chapter, verse, hebrew_json, aramaic_json, created_at, updated_at)
      VALUES (@verseId, @book, @chapter, @verse, @hebrewJson, @aramaicJson, @now, @now)
      ON CONFLICT(verse_id) DO UPDATE SET
        hebrew_json = excluded.hebrew_json,
        aramaic_json = excluded.aramaic_json,
        updated_at = excluded.updated_at
    `,
      )
      .run({
        verseId: verse.id,
        book,
        chapter: Number(chapter),
        verse: Number(number),
        hebrewJson,
        aramaicJson,
        now,
      });

    this.db
      .prepare(
        `INSERT INTO verse_state (verse_id, verified, manuscript_notes, patch_cursor, updated_at)
         VALUES (?, 0, '', 0, ?)
         ON CONFLICT(verse_id) DO NOTHING`,
      )
      .run(verse.id, now);

    this.writeVerseMirror(verse.id);
  }

  saveGenerated(verseId: VerseId, generated: GeneratedTaam[], algoVersion = "v1"): void {
    const now = new Date().toISOString();
    const confidence = generated.map((g) => ({ taamId: g.taamId, confidence: g.confidence, reasons: g.reasons }));

    this.db
      .prepare(
        `
      INSERT INTO generated_taamim (verse_id, taam_json, confidence_json, algo_version, created_at)
      VALUES (@verseId, @taamJson, @confidenceJson, @algoVersion, @createdAt)
      ON CONFLICT(verse_id) DO UPDATE SET
        taam_json = excluded.taam_json,
        confidence_json = excluded.confidence_json,
        algo_version = excluded.algo_version,
        created_at = excluded.created_at
    `,
      )
      .run({
        verseId,
        taamJson: JSON.stringify(generated),
        confidenceJson: JSON.stringify(confidence),
        algoVersion,
        createdAt: now,
      });

    this.writeVerseMirror(verseId);
  }

  private nextSeqNo(verseId: VerseId): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(seq_no), 0) as maxSeq FROM patches WHERE verse_id = ?").get(verseId) as {
      maxSeq: number;
    };
    return row.maxSeq + 1;
  }

  addPatch(verseId: VerseId, op: PatchOp, note?: string): PatchEntry {
    const entry: PatchEntry = {
      id: crypto.randomUUID(),
      verseId,
      op,
      author: this.options.author,
      note,
      createdAt: new Date().toISOString(),
      seqNo: this.nextSeqNo(verseId),
    };

    this.db
      .prepare(
        `INSERT INTO patches (id, verse_id, op_json, author, note, created_at, seq_no)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(entry.id, entry.verseId, JSON.stringify(entry.op), entry.author, entry.note ?? null, entry.createdAt, entry.seqNo);

    this.db
      .prepare("UPDATE verse_state SET patch_cursor = ?, updated_at = ? WHERE verse_id = ?")
      .run(entry.seqNo, new Date().toISOString(), verseId);

    this.writePatchMirror(verseId);
    this.writeVerseMirror(verseId);
    return entry;
  }

  setVerification(verseId: VerseId, verified: boolean, manuscriptNotes: string): void {
    this.db
      .prepare("UPDATE verse_state SET verified = ?, manuscript_notes = ?, updated_at = ? WHERE verse_id = ?")
      .run(verified ? 1 : 0, manuscriptNotes, new Date().toISOString(), verseId);

    this.writeVerseMirror(verseId);
  }

  getVerseRecord(verseId: VerseId): VerseRecord | null {
    const verseRow = this.db
      .prepare("SELECT hebrew_json, aramaic_json FROM verses WHERE verse_id = ?")
      .get(verseId) as { hebrew_json: string; aramaic_json: string } | undefined;

    if (!verseRow) {
      return null;
    }

    const generatedRow = this.db
      .prepare("SELECT taam_json FROM generated_taamim WHERE verse_id = ?")
      .get(verseId) as { taam_json: string } | undefined;

    const patchRows = this.db
      .prepare("SELECT id, op_json, author, note, created_at, seq_no FROM patches WHERE verse_id = ? ORDER BY seq_no ASC")
      .all(verseId) as Array<{
      id: string;
      op_json: string;
      author: string;
      note: string | null;
      created_at: string;
      seq_no: number;
    }>;

    const stateRow = this.db
      .prepare("SELECT verified, manuscript_notes, patch_cursor FROM verse_state WHERE verse_id = ?")
      .get(verseId) as { verified: number; manuscript_notes: string; patch_cursor: number } | undefined;

    const verse: Verse = {
      id: verseId,
      hebrewTokens: JSON.parse(verseRow.hebrew_json),
      aramaicTokens: JSON.parse(verseRow.aramaic_json),
    };

    const generated: GeneratedTaam[] = generatedRow ? JSON.parse(generatedRow.taam_json) : [];

    const patches: PatchEntry[] = patchRows.map((row) => ({
      id: row.id,
      verseId,
      op: JSON.parse(row.op_json),
      author: row.author,
      note: row.note ?? undefined,
      createdAt: row.created_at,
      seqNo: row.seq_no,
    }));

    const state: VerseState = {
      verified: Boolean(stateRow?.verified ?? 0),
      manuscriptNotes: stateRow?.manuscript_notes ?? "",
      patchCursor: stateRow?.patch_cursor ?? 0,
    };

    return { verse, generated, patches, state };
  }

  listVerseIds(): VerseId[] {
    const rows = this.db
      .prepare("SELECT verse_id FROM verses")
      .all() as Array<{ verse_id: string }>;
    return rows.map((row) => row.verse_id as VerseId).sort(compareVerseIdsCanonical);
  }

  undo(verseId: VerseId): number {
    const state = this.db
      .prepare("SELECT patch_cursor FROM verse_state WHERE verse_id = ?")
      .get(verseId) as { patch_cursor: number } | undefined;
    const next = Math.max(0, (state?.patch_cursor ?? 0) - 1);
    this.db
      .prepare("UPDATE verse_state SET patch_cursor = ?, updated_at = ? WHERE verse_id = ?")
      .run(next, new Date().toISOString(), verseId);
    this.writeVerseMirror(verseId);
    return next;
  }

  redo(verseId: VerseId): number {
    const state = this.db
      .prepare("SELECT patch_cursor FROM verse_state WHERE verse_id = ?")
      .get(verseId) as { patch_cursor: number } | undefined;

    const max = this.db
      .prepare("SELECT COALESCE(MAX(seq_no), 0) as maxSeq FROM patches WHERE verse_id = ?")
      .get(verseId) as { maxSeq: number };

    const next = Math.min(max.maxSeq, (state?.patch_cursor ?? 0) + 1);
    this.db
      .prepare("UPDATE verse_state SET patch_cursor = ?, updated_at = ? WHERE verse_id = ?")
      .run(next, new Date().toISOString(), verseId);
    this.writeVerseMirror(verseId);
    return next;
  }

  resetVerse(verseId: VerseId): number {
    this.db.prepare("DELETE FROM patches WHERE verse_id = ?").run(verseId);
    this.db
      .prepare("UPDATE verse_state SET patch_cursor = 0, updated_at = ? WHERE verse_id = ?")
      .run(new Date().toISOString(), verseId);
    this.writePatchMirror(verseId);
    this.writeVerseMirror(verseId);
    return 0;
  }

  exportJson(range?: { start?: VerseId; end?: VerseId }): unknown {
    let ids = this.listVerseIds();
    if (range?.start || range?.end) {
      ids = ids.filter((id) => isVerseIdInRange(id, range.start, range.end));
    }

    const out = ids
      .map((id) => this.getVerseRecord(id))
      .filter(Boolean)
      .map((record) => {
        const r = record as VerseRecord;
        return {
          verse: r.verse,
          generated: r.generated,
          patches: r.patches,
          state: r.state,
          edited: applyPatchLog(r.generated, r.patches, r.state.patchCursor),
        };
      });

    return out;
  }

  exportUnicode(renderer: (record: VerseRecord) => string, range?: { start?: VerseId; end?: VerseId }): string {
    let ids = this.listVerseIds();
    if (range?.start || range?.end) {
      ids = ids.filter((id) => isVerseIdInRange(id, range.start, range.end));
    }

    return ids
      .map((id) => this.getVerseRecord(id))
      .filter(Boolean)
      .map((record) => renderer(record as VerseRecord))
      .join("\n\n");
  }

  private writePatchMirror(verseId: VerseId): void {
    const record = this.getVerseRecord(verseId);
    if (!record) {
      return;
    }

    const file = patchPath(this.options.dataDir, verseId);
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, `${JSON.stringify(record.patches, null, 2)}\n`, "utf8");
  }

  private writeVerseMirror(verseId: VerseId): void {
    const record = this.getVerseRecord(verseId);
    if (!record) {
      return;
    }

    const file = versePath(this.options.dataDir, verseId);
    ensureDir(path.dirname(file));
    const edited = applyPatchLog(record.generated, record.patches, record.state.patchCursor);

    fs.writeFileSync(
      file,
      `${JSON.stringify(
        {
          verse: record.verse,
          generated: record.generated,
          edited,
          state: record.state,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
}
