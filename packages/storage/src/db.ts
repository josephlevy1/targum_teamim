import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import type Database from "better-sqlite3";
import type { GeneratedTaam, PatchEntry, PatchOp, Verse, VerseId, VerseState } from "@targum/core";
import { applyPatchLog, compareVerseIdsCanonical, isVerseIdInRange } from "@targum/core";

const require = createRequire(import.meta.url);
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

export type ManuscriptWitnessType = "scanned_images" | "ocr_text" | "digital_text";
export type ManuscriptStatus = "ok" | "partial" | "unavailable" | "failed";

export interface WitnessRecord {
  id: string;
  name: string;
  type: ManuscriptWitnessType;
  authorityWeight: number;
  sourcePriority: number | null;
  sourceLink: string | null;
  sourceFileName: string | null;
  location: string | null;
  year: number | null;
  coverage: string;
  notes: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PageRecord {
  id: string;
  witnessId: string;
  imagePath: string;
  pageIndex: number;
  thumbnailPath: string | null;
  quality: Record<string, unknown>;
  status: ManuscriptStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PageRegionRecord {
  id: string;
  pageId: string;
  regionIndex: number;
  bbox: { x: number; y: number; w: number; h: number };
  startVerseId: string | null;
  endVerseId: string | null;
  status: ManuscriptStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegionOcrArtifact {
  regionId: string;
  cropPath: string;
  cropMetadata: Record<string, unknown>;
  textRaw: string;
  ocrMeanConf: number;
  ocrCharCount: number;
  coverageRatioEst: number;
  engine: string;
  createdAt: string;
  updatedAt: string;
}

export interface WitnessVerseRecord {
  id: string;
  verseId: string;
  witnessId: string;
  textRaw: string;
  textNormalized: string;
  clarityScore: number;
  matchScore: number;
  completenessScore: number;
  sourceConfidence: number;
  status: ManuscriptStatus;
  artifacts: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkingVerseTextRecord {
  verseId: string;
  selectedSource: string;
  selectedTextNormalized: string;
  selectedTextSurface: string;
  ensembleConfidence: number;
  flags: string[];
  reasonCodes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TextReviewQueueItem {
  verseId: string;
  selectedSource: string;
  ensembleConfidence: number;
  flags: string[];
  reasonCodes: string[];
}

export interface BaseTextPatchRecord {
  id: string;
  verseId: string;
  patchType: string;
  payload: Record<string, unknown>;
  author: string;
  note?: string;
  createdAt: string;
  seqNo: number;
}

export interface OcrJobRecord {
  id: string;
  regionId: string;
  status: string;
  attempts: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export type RunStage = "ingest" | "ocr" | "split" | "confidence";
export type RunStageStatus = "pending" | "running" | "completed" | "failed" | "blocked";

export interface RunBlocker {
  stage: RunStage;
  blockerWitnessId: string;
  blockerPriority: number;
  reasonCode: string;
  detail: string;
}

export interface WitnessRunStateRecord {
  witnessId: string;
  ingestStatus: RunStageStatus;
  ocrStatus: RunStageStatus;
  splitStatus: RunStageStatus;
  confidenceStatus: RunStageStatus;
  blockers: RunBlocker[];
  updatedAt: string;
}

export interface AutomationFeedbackRecord {
  id: string;
  pageId: string;
  proposalType: "blocks" | "ranges";
  proposalId: string;
  accepted: boolean;
  confidence: number;
  hasGroundTruth: boolean;
  createdAt: string;
  actor: string;
}

export interface ManuscriptFetchRunRecord {
  id: string;
  witnessId: string;
  sourceLink: string;
  manifestUrl: string | null;
  status: "completed" | "failed";
  pageCount: number;
  error: string | null;
  createdAt: string;
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
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("synchronous = NORMAL");
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
        source_type TEXT NOT NULL DEFAULT 'manual',
        source_witness_id TEXT,
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
      CREATE UNIQUE INDEX IF NOT EXISTS idx_patches_verse_seq_unique ON patches(verse_id, seq_no);
      CREATE INDEX IF NOT EXISTS idx_verses_book_chapter ON verses(book, chapter);

      CREATE TABLE IF NOT EXISTS witnesses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        authority_weight REAL NOT NULL,
        source_priority INTEGER,
        source_link TEXT,
        source_file_name TEXT,
        location TEXT,
        year INTEGER,
        coverage TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        witness_id TEXT NOT NULL,
        image_path TEXT NOT NULL,
        page_index INTEGER NOT NULL,
        thumbnail_path TEXT,
        quality_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'ok',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (witness_id) REFERENCES witnesses(id)
      );

      CREATE TABLE IF NOT EXISTS page_regions (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        region_index INTEGER NOT NULL,
        bbox_json TEXT NOT NULL,
        start_verse_id TEXT,
        end_verse_id TEXT,
        status TEXT NOT NULL DEFAULT 'ok',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id)
      );

      CREATE TABLE IF NOT EXISTS ocr_jobs (
        id TEXT PRIMARY KEY,
        region_id TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        FOREIGN KEY (region_id) REFERENCES page_regions(id)
      );

      CREATE TABLE IF NOT EXISTS witness_verses (
        id TEXT PRIMARY KEY,
        verse_id TEXT NOT NULL,
        witness_id TEXT NOT NULL,
        text_raw TEXT NOT NULL DEFAULT '',
        text_normalized TEXT NOT NULL DEFAULT '',
        clarity_score REAL NOT NULL DEFAULT 0,
        match_score REAL NOT NULL DEFAULT 0,
        completeness_score REAL NOT NULL DEFAULT 0,
        source_confidence REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'partial',
        artifacts_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (verse_id, witness_id),
        FOREIGN KEY (verse_id) REFERENCES verses(verse_id),
        FOREIGN KEY (witness_id) REFERENCES witnesses(id)
      );

      CREATE TABLE IF NOT EXISTS working_verse_text (
        verse_id TEXT PRIMARY KEY,
        selected_source TEXT NOT NULL,
        selected_text_normalized TEXT NOT NULL DEFAULT '',
        selected_text_surface TEXT NOT NULL DEFAULT '',
        ensemble_confidence REAL NOT NULL DEFAULT 0,
        flags_json TEXT NOT NULL DEFAULT '[]',
        reason_codes_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (verse_id) REFERENCES verses(verse_id)
      );

      CREATE TABLE IF NOT EXISTS base_text_patches (
        id TEXT PRIMARY KEY,
        verse_id TEXT NOT NULL,
        patch_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        author TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        seq_no INTEGER NOT NULL,
        FOREIGN KEY (verse_id) REFERENCES verses(verse_id)
      );
      CREATE TABLE IF NOT EXISTS base_text_state (
        verse_id TEXT PRIMARY KEY,
        patch_cursor INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (verse_id) REFERENCES verses(verse_id)
      );

      CREATE INDEX IF NOT EXISTS idx_pages_witness_id ON pages(witness_id);
      CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
      CREATE INDEX IF NOT EXISTS idx_page_regions_page_id ON page_regions(page_id);
      CREATE INDEX IF NOT EXISTS idx_page_regions_status ON page_regions(status);
      CREATE INDEX IF NOT EXISTS idx_ocr_jobs_region_id ON ocr_jobs(region_id);
      CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status ON ocr_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_witness_verses_verse_id ON witness_verses(verse_id);
      CREATE INDEX IF NOT EXISTS idx_witness_verses_witness_id ON witness_verses(witness_id);
      CREATE INDEX IF NOT EXISTS idx_witness_verses_status ON witness_verses(status);
      CREATE INDEX IF NOT EXISTS idx_base_text_patches_verse_seq ON base_text_patches(verse_id, seq_no);

      CREATE TABLE IF NOT EXISTS region_ocr_artifacts (
        region_id TEXT PRIMARY KEY,
        crop_path TEXT NOT NULL,
        crop_metadata_json TEXT NOT NULL DEFAULT '{}',
        text_raw TEXT NOT NULL DEFAULT '',
        ocr_mean_conf REAL NOT NULL DEFAULT 0,
        ocr_char_count INTEGER NOT NULL DEFAULT 0,
        coverage_ratio_est REAL NOT NULL DEFAULT 0,
        engine TEXT NOT NULL DEFAULT 'mock-ocr',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (region_id) REFERENCES page_regions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_region_ocr_artifacts_region_id ON region_ocr_artifacts(region_id);

      CREATE TABLE IF NOT EXISTS manuscript_run_state (
        witness_id TEXT PRIMARY KEY,
        ingest_status TEXT NOT NULL DEFAULT 'pending',
        ocr_status TEXT NOT NULL DEFAULT 'pending',
        split_status TEXT NOT NULL DEFAULT 'pending',
        confidence_status TEXT NOT NULL DEFAULT 'pending',
        blockers_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (witness_id) REFERENCES witnesses(id)
      );
      CREATE TABLE IF NOT EXISTS manuscript_run_audit (
        id TEXT PRIMARY KEY,
        witness_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        override_used INTEGER NOT NULL DEFAULT 0,
        actor TEXT NOT NULL,
        note TEXT,
        blockers_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        FOREIGN KEY (witness_id) REFERENCES witnesses(id)
      );
      CREATE INDEX IF NOT EXISTS idx_manuscript_run_audit_witness ON manuscript_run_audit(witness_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS manuscript_automation_feedback (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        proposal_type TEXT NOT NULL,
        proposal_id TEXT NOT NULL,
        accepted INTEGER NOT NULL,
        confidence REAL NOT NULL DEFAULT 0,
        has_ground_truth INTEGER NOT NULL DEFAULT 0,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id)
      );
      CREATE INDEX IF NOT EXISTS idx_automation_feedback_page ON manuscript_automation_feedback(page_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_automation_feedback_type ON manuscript_automation_feedback(proposal_type, created_at DESC);

      CREATE TABLE IF NOT EXISTS manuscript_fetch_runs (
        id TEXT PRIMARY KEY,
        witness_id TEXT NOT NULL,
        source_link TEXT NOT NULL,
        manifest_url TEXT,
        status TEXT NOT NULL,
        page_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (witness_id) REFERENCES witnesses(id)
      );
      CREATE INDEX IF NOT EXISTS idx_manuscript_fetch_runs_witness ON manuscript_fetch_runs(witness_id, created_at DESC);
    `);

    const verseStateColumns = this.db
      .prepare("PRAGMA table_info(verse_state)")
      .all() as Array<{ name: string }>;

    if (!verseStateColumns.some((column) => column.name === "flagged")) {
      this.db.exec("ALTER TABLE verse_state ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0");
    }

    const patchColumns = this.db.prepare("PRAGMA table_info(patches)").all() as Array<{ name: string }>;
    if (!patchColumns.some((column) => column.name === "source_type")) {
      this.db.exec("ALTER TABLE patches ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual'");
    }
    if (!patchColumns.some((column) => column.name === "source_witness_id")) {
      this.db.exec("ALTER TABLE patches ADD COLUMN source_witness_id TEXT");
    }
    this.db.exec("UPDATE patches SET source_type = 'manual' WHERE source_type IS NULL OR source_type = ''");

    const ocrArtifactColumns = this.db.prepare("PRAGMA table_info(region_ocr_artifacts)").all() as Array<{ name: string }>;
    if (!ocrArtifactColumns.some((column) => column.name === "crop_metadata_json")) {
      this.db.exec("ALTER TABLE region_ocr_artifacts ADD COLUMN crop_metadata_json TEXT NOT NULL DEFAULT '{}'");
    }
  }

  close(): void {
    this.db.close();
  }

  upsertWitness(input: {
    id: string;
    name: string;
    type: ManuscriptWitnessType;
    authorityWeight: number;
    sourcePriority?: number | null;
    sourceLink?: string | null;
    sourceFileName?: string | null;
    location?: string | null;
    year?: number | null;
    coverage?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): WitnessRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO witnesses
           (id, name, type, authority_weight, source_priority, source_link, source_file_name, location, year, coverage, notes, metadata_json, created_at, updated_at)
         VALUES
           (@id, @name, @type, @authorityWeight, @sourcePriority, @sourceLink, @sourceFileName, @location, @year, @coverage, @notes, @metadataJson, @now, @now)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           type = excluded.type,
           authority_weight = excluded.authority_weight,
           source_priority = excluded.source_priority,
           source_link = excluded.source_link,
           source_file_name = excluded.source_file_name,
           location = excluded.location,
           year = excluded.year,
           coverage = excluded.coverage,
           notes = excluded.notes,
           metadata_json = excluded.metadata_json,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: input.id,
        name: input.name,
        type: input.type,
        authorityWeight: input.authorityWeight,
        sourcePriority: input.sourcePriority ?? null,
        sourceLink: input.sourceLink ?? null,
        sourceFileName: input.sourceFileName ?? null,
        location: input.location ?? null,
        year: input.year ?? null,
        coverage: input.coverage ?? "",
        notes: input.notes ?? "",
        metadataJson: JSON.stringify(input.metadata ?? {}),
        now,
      });

    return this.getWitness(input.id) as WitnessRecord;
  }

  getWitness(id: string): WitnessRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, name, type, authority_weight, source_priority, source_link, source_file_name, location, year, coverage, notes, metadata_json, created_at, updated_at
         FROM witnesses
         WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          name: string;
          type: ManuscriptWitnessType;
          authority_weight: number;
          source_priority: number | null;
          source_link: string | null;
          source_file_name: string | null;
          location: string | null;
          year: number | null;
          coverage: string;
          notes: string;
          metadata_json: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      authorityWeight: row.authority_weight,
      sourcePriority: row.source_priority,
      sourceLink: row.source_link,
      sourceFileName: row.source_file_name,
      location: row.location,
      year: row.year,
      coverage: row.coverage,
      notes: row.notes,
      metadata: JSON.parse(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listWitnesses(): WitnessRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, type, authority_weight, source_priority, source_link, source_file_name, location, year, coverage, notes, metadata_json, created_at, updated_at
         FROM witnesses
         ORDER BY
           CASE WHEN source_priority IS NULL THEN 1 ELSE 0 END,
           source_priority ASC,
           name ASC`,
      )
      .all() as Array<{
      id: string;
      name: string;
      type: ManuscriptWitnessType;
      authority_weight: number;
      source_priority: number | null;
      source_link: string | null;
      source_file_name: string | null;
      location: string | null;
      year: number | null;
      coverage: string;
      notes: string;
      metadata_json: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      authorityWeight: row.authority_weight,
      sourcePriority: row.source_priority,
      sourceLink: row.source_link,
      sourceFileName: row.source_file_name,
      location: row.location,
      year: row.year,
      coverage: row.coverage,
      notes: row.notes,
      metadata: JSON.parse(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  importPagesFromDirectory(input: { witnessId: string; directoryPath: string; startIndex?: number }): { imported: number; pages: PageRecord[] } {
    const witness = this.getWitness(input.witnessId);
    if (!witness) {
      throw new Error(`Witness not found: ${input.witnessId}`);
    }
    if (!fs.existsSync(input.directoryPath)) {
      throw new Error(`Directory does not exist: ${input.directoryPath}`);
    }

    const supported = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".pdf"]);
    const files = fs
      .readdirSync(input.directoryPath)
      .map((name) => path.join(input.directoryPath, name))
      .filter((filePath) => fs.statSync(filePath).isFile())
      .filter((filePath) => supported.has(path.extname(filePath).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO pages (id, witness_id, image_path, page_index, thumbnail_path, quality_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         image_path = excluded.image_path,
         page_index = excluded.page_index,
         thumbnail_path = excluded.thumbnail_path,
         quality_json = excluded.quality_json,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    );

    const pages: PageRecord[] = [];
    const run = this.db.transaction(() => {
      const startIndex = input.startIndex ?? 1;
      files.forEach((filePath, index) => {
        const quality = { fileSizeBytes: fs.statSync(filePath).size, extension: path.extname(filePath).toLowerCase() };
        const status: ManuscriptStatus = quality.extension === ".pdf" ? "partial" : "ok";
        const pageIndex = startIndex + index;
        const id = `${input.witnessId}:page:${pageIndex}`;
        insert.run(id, input.witnessId, filePath, pageIndex, null, JSON.stringify(quality), status, now, now);
      });
    });
    run();

    return {
      imported: files.length,
      pages: this.listPagesByWitness(input.witnessId),
    };
  }

  listPagesByWitness(witnessId: string): PageRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, witness_id, image_path, page_index, thumbnail_path, quality_json, status, created_at, updated_at
         FROM pages WHERE witness_id = ? ORDER BY page_index ASC`,
      )
      .all(witnessId) as Array<{
      id: string;
      witness_id: string;
      image_path: string;
      page_index: number;
      thumbnail_path: string | null;
      quality_json: string;
      status: ManuscriptStatus;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      witnessId: row.witness_id,
      imagePath: row.image_path,
      pageIndex: row.page_index,
      thumbnailPath: row.thumbnail_path,
      quality: JSON.parse(row.quality_json),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getPage(id: string): PageRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, witness_id, image_path, page_index, thumbnail_path, quality_json, status, created_at, updated_at
         FROM pages WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          witness_id: string;
          image_path: string;
          page_index: number;
          thumbnail_path: string | null;
          quality_json: string;
          status: ManuscriptStatus;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      witnessId: row.witness_id,
      imagePath: row.image_path,
      pageIndex: row.page_index,
      thumbnailPath: row.thumbnail_path,
      quality: JSON.parse(row.quality_json),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  updatePageArtifacts(input: {
    pageId: string;
    thumbnailPath?: string | null;
    quality?: Record<string, unknown>;
    status?: ManuscriptStatus;
  }): PageRecord {
    const now = new Date().toISOString();
    const current = this.getPage(input.pageId);
    if (!current) throw new Error(`Page not found: ${input.pageId}`);

    this.db
      .prepare(
        `UPDATE pages
         SET thumbnail_path = ?, quality_json = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.thumbnailPath === undefined ? current.thumbnailPath : input.thumbnailPath,
        JSON.stringify(input.quality ?? current.quality),
        input.status ?? current.status,
        now,
        input.pageId,
      );

    return this.getPage(input.pageId) as PageRecord;
  }

  upsertPageRegion(input: {
    id?: string;
    pageId: string;
    regionIndex: number;
    bbox: { x: number; y: number; w: number; h: number };
    startVerseId?: string | null;
    endVerseId?: string | null;
    status?: ManuscriptStatus;
    notes?: string;
  }): PageRegionRecord {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO page_regions (id, page_id, region_index, bbox_json, start_verse_id, end_verse_id, status, notes, created_at, updated_at)
         VALUES (@id, @pageId, @regionIndex, @bboxJson, @startVerseId, @endVerseId, @status, @notes, @now, @now)
         ON CONFLICT(id) DO UPDATE SET
           page_id = excluded.page_id,
           region_index = excluded.region_index,
           bbox_json = excluded.bbox_json,
           start_verse_id = excluded.start_verse_id,
           end_verse_id = excluded.end_verse_id,
           status = excluded.status,
           notes = excluded.notes,
           updated_at = excluded.updated_at`,
      )
      .run({
        id,
        pageId: input.pageId,
        regionIndex: input.regionIndex,
        bboxJson: JSON.stringify(input.bbox),
        startVerseId: input.startVerseId ?? null,
        endVerseId: input.endVerseId ?? null,
        status: input.status ?? "ok",
        notes: input.notes ?? "",
        now,
      });

    const region = this.getPageRegion(id);
    if (!region) throw new Error("Failed to upsert region.");
    return region;
  }

  getPageRegion(id: string): PageRegionRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, page_id, region_index, bbox_json, start_verse_id, end_verse_id, status, notes, created_at, updated_at
         FROM page_regions WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          page_id: string;
          region_index: number;
          bbox_json: string;
          start_verse_id: string | null;
          end_verse_id: string | null;
          status: ManuscriptStatus;
          notes: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      pageId: row.page_id,
      regionIndex: row.region_index,
      bbox: JSON.parse(row.bbox_json),
      startVerseId: row.start_verse_id,
      endVerseId: row.end_verse_id,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  upsertRegionOcrArtifact(input: {
    regionId: string;
    cropPath: string;
    cropMetadata?: Record<string, unknown>;
    textRaw: string;
    ocrMeanConf: number;
    ocrCharCount: number;
    coverageRatioEst: number;
    engine: string;
  }): RegionOcrArtifact {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO region_ocr_artifacts
         (region_id, crop_path, crop_metadata_json, text_raw, ocr_mean_conf, ocr_char_count, coverage_ratio_est, engine, created_at, updated_at)
         VALUES
         (@regionId, @cropPath, @cropMetadataJson, @textRaw, @ocrMeanConf, @ocrCharCount, @coverageRatioEst, @engine, @now, @now)
         ON CONFLICT(region_id) DO UPDATE SET
           crop_path = excluded.crop_path,
           crop_metadata_json = excluded.crop_metadata_json,
           text_raw = excluded.text_raw,
           ocr_mean_conf = excluded.ocr_mean_conf,
           ocr_char_count = excluded.ocr_char_count,
           coverage_ratio_est = excluded.coverage_ratio_est,
           engine = excluded.engine,
           updated_at = excluded.updated_at`,
      )
      .run({
        ...input,
        cropMetadataJson: JSON.stringify(input.cropMetadata ?? {}),
        now,
      });
    return this.getRegionOcrArtifact(input.regionId) as RegionOcrArtifact;
  }

  getRegionOcrArtifact(regionId: string): RegionOcrArtifact | null {
    const row = this.db
      .prepare(
        `SELECT region_id, crop_path, crop_metadata_json, text_raw, ocr_mean_conf, ocr_char_count, coverage_ratio_est, engine, created_at, updated_at
         FROM region_ocr_artifacts WHERE region_id = ?`,
      )
      .get(regionId) as
      | {
          region_id: string;
          crop_path: string;
          crop_metadata_json: string;
          text_raw: string;
          ocr_mean_conf: number;
          ocr_char_count: number;
          coverage_ratio_est: number;
          engine: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      regionId: row.region_id,
      cropPath: row.crop_path,
      cropMetadata: JSON.parse(row.crop_metadata_json),
      textRaw: row.text_raw,
      ocrMeanConf: row.ocr_mean_conf,
      ocrCharCount: row.ocr_char_count,
      coverageRatioEst: row.coverage_ratio_est,
      engine: row.engine,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  upsertWitnessVerse(input: {
    verseId: string;
    witnessId: string;
    textRaw: string;
    textNormalized: string;
    clarityScore: number;
    matchScore: number;
    completenessScore: number;
    sourceConfidence: number;
    status: ManuscriptStatus;
    artifacts?: Record<string, unknown>;
  }): WitnessVerseRecord {
    const now = new Date().toISOString();
    const id = `${input.verseId}:${input.witnessId}`;
    this.db
      .prepare(
        `INSERT INTO witness_verses
        (id, verse_id, witness_id, text_raw, text_normalized, clarity_score, match_score, completeness_score, source_confidence, status, artifacts_json, created_at, updated_at)
        VALUES
        (@id, @verseId, @witnessId, @textRaw, @textNormalized, @clarityScore, @matchScore, @completenessScore, @sourceConfidence, @status, @artifactsJson, @now, @now)
        ON CONFLICT(verse_id, witness_id) DO UPDATE SET
          text_raw = excluded.text_raw,
          text_normalized = excluded.text_normalized,
          clarity_score = excluded.clarity_score,
          match_score = excluded.match_score,
          completeness_score = excluded.completeness_score,
          source_confidence = excluded.source_confidence,
          status = excluded.status,
          artifacts_json = excluded.artifacts_json,
          updated_at = excluded.updated_at`,
      )
      .run({
        id,
        ...input,
        artifactsJson: JSON.stringify(input.artifacts ?? {}),
        now,
      });
    return this.getWitnessVerse(input.verseId, input.witnessId) as WitnessVerseRecord;
  }

  getWitnessVerse(verseId: string, witnessId: string): WitnessVerseRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, verse_id, witness_id, text_raw, text_normalized, clarity_score, match_score, completeness_score, source_confidence, status, artifacts_json, created_at, updated_at
         FROM witness_verses WHERE verse_id = ? AND witness_id = ?`,
      )
      .get(verseId, witnessId) as
      | {
          id: string;
          verse_id: string;
          witness_id: string;
          text_raw: string;
          text_normalized: string;
          clarity_score: number;
          match_score: number;
          completeness_score: number;
          source_confidence: number;
          status: ManuscriptStatus;
          artifacts_json: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      verseId: row.verse_id,
      witnessId: row.witness_id,
      textRaw: row.text_raw,
      textNormalized: row.text_normalized,
      clarityScore: row.clarity_score,
      matchScore: row.match_score,
      completenessScore: row.completeness_score,
      sourceConfidence: row.source_confidence,
      status: row.status,
      artifacts: JSON.parse(row.artifacts_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listWitnessVersesForVerse(verseId: string): WitnessVerseRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, verse_id, witness_id, text_raw, text_normalized, clarity_score, match_score, completeness_score, source_confidence, status, artifacts_json, created_at, updated_at
         FROM witness_verses WHERE verse_id = ?`,
      )
      .all(verseId) as Array<{
      id: string;
      verse_id: string;
      witness_id: string;
      text_raw: string;
      text_normalized: string;
      clarity_score: number;
      match_score: number;
      completeness_score: number;
      source_confidence: number;
      status: ManuscriptStatus;
      artifacts_json: string;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      verseId: row.verse_id,
      witnessId: row.witness_id,
      textRaw: row.text_raw,
      textNormalized: row.text_normalized,
      clarityScore: row.clarity_score,
      matchScore: row.match_score,
      completenessScore: row.completeness_score,
      sourceConfidence: row.source_confidence,
      status: row.status,
      artifacts: JSON.parse(row.artifacts_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  upsertWorkingVerseText(input: {
    verseId: string;
    selectedSource: string;
    selectedTextNormalized: string;
    selectedTextSurface: string;
    ensembleConfidence: number;
    flags: string[];
    reasonCodes: string[];
  }): WorkingVerseTextRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO working_verse_text
         (verse_id, selected_source, selected_text_normalized, selected_text_surface, ensemble_confidence, flags_json, reason_codes_json, created_at, updated_at)
         VALUES
         (@verseId, @selectedSource, @selectedTextNormalized, @selectedTextSurface, @ensembleConfidence, @flagsJson, @reasonCodesJson, @now, @now)
         ON CONFLICT(verse_id) DO UPDATE SET
           selected_source = excluded.selected_source,
           selected_text_normalized = excluded.selected_text_normalized,
           selected_text_surface = excluded.selected_text_surface,
           ensemble_confidence = excluded.ensemble_confidence,
           flags_json = excluded.flags_json,
           reason_codes_json = excluded.reason_codes_json,
           updated_at = excluded.updated_at`,
      )
      .run({
        ...input,
        flagsJson: JSON.stringify(input.flags),
        reasonCodesJson: JSON.stringify(input.reasonCodes),
        now,
      });
    return this.getWorkingVerseText(input.verseId) as WorkingVerseTextRecord;
  }

  getWorkingVerseText(verseId: string): WorkingVerseTextRecord | null {
    const row = this.db
      .prepare(
        `SELECT verse_id, selected_source, selected_text_normalized, selected_text_surface, ensemble_confidence, flags_json, reason_codes_json, created_at, updated_at
         FROM working_verse_text WHERE verse_id = ?`,
      )
      .get(verseId) as
      | {
          verse_id: string;
          selected_source: string;
          selected_text_normalized: string;
          selected_text_surface: string;
          ensemble_confidence: number;
          flags_json: string;
          reason_codes_json: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      verseId: row.verse_id,
      selectedSource: row.selected_source,
      selectedTextNormalized: row.selected_text_normalized,
      selectedTextSurface: row.selected_text_surface,
      ensembleConfidence: row.ensemble_confidence,
      flags: JSON.parse(row.flags_json),
      reasonCodes: JSON.parse(row.reason_codes_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listTextReviewQueue(filter: "low_confidence" | "disagreement" | "unavailable_partial"): TextReviewQueueItem[] {
    const rows = this.db
      .prepare(
        `SELECT verse_id, selected_source, ensemble_confidence, flags_json, reason_codes_json
         FROM working_verse_text`,
      )
      .all() as Array<{
      verse_id: string;
      selected_source: string;
      ensemble_confidence: number;
      flags_json: string;
      reason_codes_json: string;
    }>;

    const items: TextReviewQueueItem[] = rows.map((row) => ({
      verseId: row.verse_id,
      selectedSource: row.selected_source,
      ensembleConfidence: row.ensemble_confidence,
      flags: JSON.parse(row.flags_json),
      reasonCodes: JSON.parse(row.reason_codes_json),
    }));

    if (filter === "low_confidence") {
      return items.filter((item) => item.ensembleConfidence < 0.65).sort((a, b) => a.ensembleConfidence - b.ensembleConfidence);
    }
    if (filter === "disagreement") {
      return items.filter((item) => item.flags.includes("DISAGREEMENT_FLAG"));
    }

    return items.filter((item) =>
      item.reasonCodes.some((code) => code.includes("UNAVAILABLE") || code.includes("SCAN_WITNESSES_BELOW_THRESHOLD")),
    );
  }

  addBaseTextPatch(input: {
    verseId: string;
    patchType: "APPLY_WITNESS_READING" | "REPLACE_VERSE_TEXT" | "MANUAL_TEXT_EDIT";
    payload: Record<string, unknown>;
    note?: string;
    author?: string;
  }): BaseTextPatchRecord {
    const now = new Date().toISOString();
    const run = this.db.transaction((payload: typeof input) => {
      const row = this.db
        .prepare("SELECT COALESCE(MAX(seq_no), 0) as maxSeq FROM base_text_patches WHERE verse_id = ?")
        .get(payload.verseId) as { maxSeq: number };

      const patch: BaseTextPatchRecord = {
        id: crypto.randomUUID(),
        verseId: payload.verseId,
        patchType: payload.patchType,
        payload: payload.payload,
        author: payload.author ?? this.options.author,
        note: payload.note,
        createdAt: now,
        seqNo: row.maxSeq + 1,
      };

      this.db
        .prepare(
          `INSERT INTO base_text_patches (id, verse_id, patch_type, payload_json, author, note, created_at, seq_no)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          patch.id,
          patch.verseId,
          patch.patchType,
          JSON.stringify(patch.payload),
          patch.author,
          patch.note ?? null,
          patch.createdAt,
          patch.seqNo,
        );

      this.db
        .prepare(
          `INSERT INTO base_text_state (verse_id, patch_cursor, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(verse_id) DO UPDATE SET patch_cursor = excluded.patch_cursor, updated_at = excluded.updated_at`,
        )
        .run(patch.verseId, patch.seqNo, now);

      return patch;
    });

    const patch = run(input);
    this.applyBaseTextPatchCursor(input.verseId);
    return patch;
  }

  createOcrJob(regionId: string): OcrJobRecord {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO ocr_jobs (id, region_id, status, attempts, error, created_at, started_at, finished_at)
         VALUES (?, ?, 'queued', 0, null, ?, null, null)`,
      )
      .run(id, regionId, now);
    return this.getOcrJob(id) as OcrJobRecord;
  }

  updateOcrJobStatus(id: string, status: "queued" | "running" | "completed" | "failed", error?: string): OcrJobRecord | null {
    const now = new Date().toISOString();
    if (status === "running") {
      this.db
        .prepare("UPDATE ocr_jobs SET status = ?, attempts = attempts + 1, error = NULL, started_at = ? WHERE id = ?")
        .run(status, now, id);
    } else if (status === "failed") {
      this.db
        .prepare("UPDATE ocr_jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?")
        .run(status, error ?? "unknown error", now, id);
    } else if (status === "completed") {
      this.db
        .prepare("UPDATE ocr_jobs SET status = ?, error = NULL, finished_at = ? WHERE id = ?")
        .run(status, now, id);
    } else {
      this.db.prepare("UPDATE ocr_jobs SET status = ?, error = NULL WHERE id = ?").run(status, id);
    }
    return this.getOcrJob(id);
  }

  getOcrJob(id: string): OcrJobRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, region_id, status, attempts, error, created_at, started_at, finished_at
         FROM ocr_jobs WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          region_id: string;
          status: string;
          attempts: number;
          error: string | null;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      regionId: row.region_id,
      status: row.status,
      attempts: row.attempts,
      error: row.error ?? undefined,
      createdAt: row.created_at,
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined,
    };
  }

  listOcrJobs(status?: string): OcrJobRecord[] {
    const rows = (status
      ? this.db
          .prepare(
            `SELECT id, region_id, status, attempts, error, created_at, started_at, finished_at
             FROM ocr_jobs WHERE status = ? ORDER BY created_at DESC`,
          )
          .all(status)
      : this.db
          .prepare(
            `SELECT id, region_id, status, attempts, error, created_at, started_at, finished_at
             FROM ocr_jobs ORDER BY created_at DESC`,
          )
          .all()) as Array<{
      id: string;
      region_id: string;
      status: string;
      attempts: number;
      error: string | null;
      created_at: string;
      started_at: string | null;
      finished_at: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      regionId: row.region_id,
      status: row.status,
      attempts: row.attempts,
      error: row.error ?? undefined,
      createdAt: row.created_at,
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined,
    }));
  }

  listBaseTextPatches(verseId: string): BaseTextPatchRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, verse_id, patch_type, payload_json, author, note, created_at, seq_no
         FROM base_text_patches WHERE verse_id = ? ORDER BY seq_no ASC`,
      )
      .all(verseId) as Array<{
      id: string;
      verse_id: string;
      patch_type: string;
      payload_json: string;
      author: string;
      note: string | null;
      created_at: string;
      seq_no: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      verseId: row.verse_id,
      patchType: row.patch_type,
      payload: JSON.parse(row.payload_json),
      author: row.author,
      note: row.note ?? undefined,
      createdAt: row.created_at,
      seqNo: row.seq_no,
    }));
  }

  getBaseTextPatchCursor(verseId: string): number {
    const row = this.db
      .prepare("SELECT patch_cursor FROM base_text_state WHERE verse_id = ?")
      .get(verseId) as { patch_cursor: number } | undefined;
    return row?.patch_cursor ?? 0;
  }

  undoBaseText(verseId: string): number {
    const next = Math.max(0, this.getBaseTextPatchCursor(verseId) - 1);
    this.db
      .prepare(
        `INSERT INTO base_text_state (verse_id, patch_cursor, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(verse_id) DO UPDATE SET patch_cursor = excluded.patch_cursor, updated_at = excluded.updated_at`,
      )
      .run(verseId, next, new Date().toISOString());
    this.applyBaseTextPatchCursor(verseId);
    return next;
  }

  redoBaseText(verseId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(seq_no), 0) as maxSeq FROM base_text_patches WHERE verse_id = ?")
      .get(verseId) as { maxSeq: number };
    const next = Math.min(row.maxSeq, this.getBaseTextPatchCursor(verseId) + 1);
    this.db
      .prepare(
        `INSERT INTO base_text_state (verse_id, patch_cursor, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(verse_id) DO UPDATE SET patch_cursor = excluded.patch_cursor, updated_at = excluded.updated_at`,
      )
      .run(verseId, next, new Date().toISOString());
    this.applyBaseTextPatchCursor(verseId);
    return next;
  }

  private applyBaseTextPatchCursor(verseId: string): void {
    const cursor = this.getBaseTextPatchCursor(verseId);
    if (cursor <= 0) {
      const record = this.getVerseRecord(verseId as VerseId);
      const baselineText =
        record?.verse.aramaicTokens
          .map((token) => token.letters.map((letter) => `${letter.baseChar}${letter.niqqud.join("")}`).join(""))
          .join(" ") ?? "";
      this.upsertWorkingVerseText({
        verseId,
        selectedSource: "baseline_digital",
        selectedTextNormalized: baselineText,
        selectedTextSurface: baselineText,
        ensembleConfidence: 0.45,
        flags: [],
        reasonCodes: ["PATCH_CURSOR_RESET_BASELINE"],
      });
      return;
    }

    const patch = this.db
      .prepare(
        `SELECT payload_json FROM base_text_patches WHERE verse_id = ? AND seq_no = ?`,
      )
      .get(verseId, cursor) as { payload_json: string } | undefined;
    if (!patch) return;
    const payload = JSON.parse(patch.payload_json) as {
      selectedSource?: string;
      selectedTextNormalized?: string;
      selectedTextSurface?: string;
      ensembleConfidence?: number;
      flags?: string[];
      reasonCodes?: string[];
    };
    this.upsertWorkingVerseText({
      verseId,
      selectedSource: payload.selectedSource ?? "baseline_digital",
      selectedTextNormalized: payload.selectedTextNormalized ?? "",
      selectedTextSurface: payload.selectedTextSurface ?? "",
      ensembleConfidence: payload.ensembleConfidence ?? 0.45,
      flags: payload.flags ?? [],
      reasonCodes: payload.reasonCodes ?? [],
    });
  }

  listRegionsByPage(pageId: string): PageRegionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, page_id, region_index, bbox_json, start_verse_id, end_verse_id, status, notes, created_at, updated_at
         FROM page_regions WHERE page_id = ? ORDER BY region_index ASC, created_at ASC`,
      )
      .all(pageId) as Array<{
      id: string;
      page_id: string;
      region_index: number;
      bbox_json: string;
      start_verse_id: string | null;
      end_verse_id: string | null;
      status: ManuscriptStatus;
      notes: string;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      pageId: row.page_id,
      regionIndex: row.region_index,
      bbox: JSON.parse(row.bbox_json),
      startVerseId: row.start_verse_id,
      endVerseId: row.end_verse_id,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  deletePageRegion(regionId: string): void {
    this.db.prepare("DELETE FROM page_regions WHERE id = ?").run(regionId);
  }

  getWitnessProgress(witnessId: string): {
    pagesAnnotated: number;
    totalPages: number;
    regionsPendingOcr: number;
  } {
    const totalPagesRow = this.db
      .prepare("SELECT COUNT(*) as count FROM pages WHERE witness_id = ?")
      .get(witnessId) as { count: number };

    const pagesAnnotatedRow = this.db
      .prepare(
        `SELECT COUNT(DISTINCT p.id) as count
         FROM pages p
         JOIN page_regions r ON r.page_id = p.id
         WHERE p.witness_id = ?`,
      )
      .get(witnessId) as { count: number };

    const regionsPendingOcrRow = this.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM page_regions r
         JOIN pages p ON p.id = r.page_id
         LEFT JOIN region_ocr_artifacts a ON a.region_id = r.id
         WHERE p.witness_id = ? AND r.status NOT IN ('unavailable', 'failed') AND a.region_id IS NULL`,
      )
      .get(witnessId) as { count: number };

    return {
      pagesAnnotated: pagesAnnotatedRow.count,
      totalPages: totalPagesRow.count,
      regionsPendingOcr: regionsPendingOcrRow.count,
    };
  }

  getWitnessRunState(witnessId: string): WitnessRunStateRecord {
    const row = this.db
      .prepare(
        `SELECT witness_id, ingest_status, ocr_status, split_status, confidence_status, blockers_json, updated_at
         FROM manuscript_run_state WHERE witness_id = ?`,
      )
      .get(witnessId) as
      | {
          witness_id: string;
          ingest_status: RunStageStatus;
          ocr_status: RunStageStatus;
          split_status: RunStageStatus;
          confidence_status: RunStageStatus;
          blockers_json: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO manuscript_run_state
           (witness_id, ingest_status, ocr_status, split_status, confidence_status, blockers_json, updated_at)
           VALUES (?, 'pending', 'pending', 'pending', 'pending', '[]', ?)`,
        )
        .run(witnessId, now);
      return {
        witnessId,
        ingestStatus: "pending",
        ocrStatus: "pending",
        splitStatus: "pending",
        confidenceStatus: "pending",
        blockers: [],
        updatedAt: now,
      };
    }

    return {
      witnessId: row.witness_id,
      ingestStatus: row.ingest_status,
      ocrStatus: row.ocr_status,
      splitStatus: row.split_status,
      confidenceStatus: row.confidence_status,
      blockers: JSON.parse(row.blockers_json),
      updatedAt: row.updated_at,
    };
  }

  setWitnessRunStage(input: {
    witnessId: string;
    stage: RunStage;
    status: RunStageStatus;
    blockers?: RunBlocker[];
    actor?: string;
    note?: string;
    overrideUsed?: boolean;
  }): WitnessRunStateRecord {
    const now = new Date().toISOString();
    const blockers = input.blockers ?? [];
    const current = this.getWitnessRunState(input.witnessId);
    const next = {
      ingestStatus: current.ingestStatus,
      ocrStatus: current.ocrStatus,
      splitStatus: current.splitStatus,
      confidenceStatus: current.confidenceStatus,
    };
    if (input.stage === "ingest") next.ingestStatus = input.status;
    if (input.stage === "ocr") next.ocrStatus = input.status;
    if (input.stage === "split") next.splitStatus = input.status;
    if (input.stage === "confidence") next.confidenceStatus = input.status;

    this.db
      .prepare(
        `INSERT INTO manuscript_run_state
         (witness_id, ingest_status, ocr_status, split_status, confidence_status, blockers_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(witness_id) DO UPDATE SET
           ingest_status = excluded.ingest_status,
           ocr_status = excluded.ocr_status,
           split_status = excluded.split_status,
           confidence_status = excluded.confidence_status,
           blockers_json = excluded.blockers_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.witnessId,
        next.ingestStatus,
        next.ocrStatus,
        next.splitStatus,
        next.confidenceStatus,
        JSON.stringify(blockers),
        now,
      );

    this.db
      .prepare(
        `INSERT INTO manuscript_run_audit
         (id, witness_id, stage, status, override_used, actor, note, blockers_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        input.witnessId,
        input.stage,
        input.status,
        input.overrideUsed ? 1 : 0,
        input.actor ?? this.options.author,
        input.note ?? null,
        JSON.stringify(blockers),
        now,
      );

    return this.getWitnessRunState(input.witnessId);
  }

  addAutomationFeedback(input: {
    pageId: string;
    proposalType: "blocks" | "ranges";
    proposalId: string;
    accepted: boolean;
    confidence: number;
    hasGroundTruth?: boolean;
    actor?: string;
  }): AutomationFeedbackRecord {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO manuscript_automation_feedback
         (id, page_id, proposal_type, proposal_id, accepted, confidence, has_ground_truth, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.pageId,
        input.proposalType,
        input.proposalId,
        input.accepted ? 1 : 0,
        input.confidence,
        input.hasGroundTruth ? 1 : 0,
        input.actor ?? this.options.author,
        now,
      );
    return {
      id,
      pageId: input.pageId,
      proposalType: input.proposalType,
      proposalId: input.proposalId,
      accepted: input.accepted,
      confidence: input.confidence,
      hasGroundTruth: Boolean(input.hasGroundTruth),
      actor: input.actor ?? this.options.author,
      createdAt: now,
    };
  }

  getAutomationMetrics(proposalType?: "blocks" | "ranges"): {
    total: number;
    accepted: number;
    rejected: number;
    precision: number;
    recall: number;
  } {
    const rows = (proposalType
      ? this.db
          .prepare(
            `SELECT accepted, has_ground_truth
             FROM manuscript_automation_feedback
             WHERE proposal_type = ?`,
          )
          .all(proposalType)
      : this.db
          .prepare(
            `SELECT accepted, has_ground_truth
             FROM manuscript_automation_feedback`,
          )
          .all()) as Array<{ accepted: number; has_ground_truth: number }>;

    const total = rows.length;
    const accepted = rows.filter((row) => row.accepted === 1).length;
    const rejected = total - accepted;
    const withGroundTruth = rows.filter((row) => row.has_ground_truth === 1);
    const truePositive = withGroundTruth.filter((row) => row.accepted === 1).length;
    const falsePositive = withGroundTruth.filter((row) => row.accepted === 0).length;
    const falseNegative = Math.max(0, withGroundTruth.length - truePositive);

    const precision = truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : 0;
    const recall = truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : 0;
    return { total, accepted, rejected, precision, recall };
  }

  addManuscriptFetchRun(input: {
    witnessId: string;
    sourceLink: string;
    manifestUrl?: string | null;
    status: "completed" | "failed";
    pageCount: number;
    error?: string | null;
  }): ManuscriptFetchRunRecord {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO manuscript_fetch_runs
         (id, witness_id, source_link, manifest_url, status, page_count, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.witnessId, input.sourceLink, input.manifestUrl ?? null, input.status, input.pageCount, input.error ?? null, now);

    return {
      id,
      witnessId: input.witnessId,
      sourceLink: input.sourceLink,
      manifestUrl: input.manifestUrl ?? null,
      status: input.status,
      pageCount: input.pageCount,
      error: input.error ?? null,
      createdAt: now,
    };
  }

  listManuscriptFetchRuns(witnessId?: string): ManuscriptFetchRunRecord[] {
    const rows = (witnessId
      ? this.db
          .prepare(
            `SELECT id, witness_id, source_link, manifest_url, status, page_count, error, created_at
             FROM manuscript_fetch_runs
             WHERE witness_id = ?
             ORDER BY created_at DESC`,
          )
          .all(witnessId)
      : this.db
          .prepare(
            `SELECT id, witness_id, source_link, manifest_url, status, page_count, error, created_at
             FROM manuscript_fetch_runs
             ORDER BY created_at DESC`,
          )
          .all()) as Array<{
      id: string;
      witness_id: string;
      source_link: string;
      manifest_url: string | null;
      status: "completed" | "failed";
      page_count: number;
      error: string | null;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      witnessId: row.witness_id,
      sourceLink: row.source_link,
      manifestUrl: row.manifest_url,
      status: row.status,
      pageCount: row.page_count,
      error: row.error,
      createdAt: row.created_at,
    }));
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
        `INSERT INTO verse_state (verse_id, verified, flagged, manuscript_notes, patch_cursor, updated_at)
         VALUES (?, 0, 0, '', 0, ?)
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

  addPatch(
    verseId: VerseId,
    op: PatchOp,
    note?: string,
    authorOverride?: string,
    source?: { sourceType?: "manual" | "import" | "automation"; sourceWitnessId?: string | null },
  ): PatchEntry {
    const run = this.db.transaction(
      (
        targetVerseId: VerseId,
        patchOp: PatchOp,
        patchNote: string | undefined,
        patchAuthor: string,
        patchSourceType: "manual" | "import" | "automation",
        patchSourceWitnessId: string | null,
      ): PatchEntry => {
      const row = this.db
        .prepare("SELECT COALESCE(MAX(seq_no), 0) as maxSeq FROM patches WHERE verse_id = ?")
        .get(targetVerseId) as { maxSeq: number };
      const now = new Date().toISOString();
      const entry: PatchEntry = {
        id: crypto.randomUUID(),
        verseId: targetVerseId,
        op: patchOp,
        sourceType: patchSourceType,
        sourceWitnessId: patchSourceWitnessId,
        author: patchAuthor,
        note: patchNote,
        createdAt: now,
        seqNo: row.maxSeq + 1,
      };

      this.db
        .prepare(
          `INSERT INTO patches (id, verse_id, op_json, source_type, source_witness_id, author, note, created_at, seq_no)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          entry.id,
          entry.verseId,
          JSON.stringify(entry.op),
          entry.sourceType,
          entry.sourceWitnessId ?? null,
          entry.author,
          entry.note ?? null,
          entry.createdAt,
          entry.seqNo,
        );

      this.db
        .prepare("UPDATE verse_state SET patch_cursor = ?, updated_at = ? WHERE verse_id = ?")
        .run(entry.seqNo, now, targetVerseId);
      return entry;
      },
    );

    const entry = run(
      verseId,
      op,
      note,
      authorOverride ?? this.options.author,
      source?.sourceType ?? "manual",
      source?.sourceWitnessId ?? null,
    );

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

  setFlagged(verseId: VerseId, flagged: boolean): void {
    this.db
      .prepare("UPDATE verse_state SET flagged = ?, updated_at = ? WHERE verse_id = ?")
      .run(flagged ? 1 : 0, new Date().toISOString(), verseId);

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
      .prepare(
        "SELECT id, op_json, source_type, source_witness_id, author, note, created_at, seq_no FROM patches WHERE verse_id = ? ORDER BY seq_no ASC",
      )
      .all(verseId) as Array<{
      id: string;
      op_json: string;
      source_type: "manual" | "import" | "automation";
      source_witness_id: string | null;
      author: string;
      note: string | null;
      created_at: string;
      seq_no: number;
    }>;

    const stateRow = this.db
      .prepare("SELECT verified, flagged, manuscript_notes, patch_cursor FROM verse_state WHERE verse_id = ?")
      .get(verseId) as { verified: number; flagged: number; manuscript_notes: string; patch_cursor: number } | undefined;

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
      sourceType: row.source_type,
      sourceWitnessId: row.source_witness_id,
      author: row.author,
      note: row.note ?? undefined,
      createdAt: row.created_at,
      seqNo: row.seq_no,
    }));

    const state: VerseState = {
      verified: Boolean(stateRow?.verified ?? 0),
      flagged: Boolean(stateRow?.flagged ?? 0),
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

  listBooksAndChapters(): Array<{ book: string; chapter: number }> {
    return this.db
      .prepare("SELECT DISTINCT book, chapter FROM verses ORDER BY book, chapter")
      .all() as Array<{ book: string; chapter: number }>;
  }

  getChapterRecords(book: string, chapter: number): VerseRecord[] {
    const verseRows = this.db
      .prepare("SELECT verse_id, hebrew_json, aramaic_json FROM verses WHERE book = ? AND chapter = ? ORDER BY verse")
      .all(book, chapter) as Array<{ verse_id: string; hebrew_json: string; aramaic_json: string }>;

    if (verseRows.length === 0) return [];

    const verseIds = verseRows.map((r) => r.verse_id);
    const placeholders = verseIds.map(() => "?").join(",");

    const generatedRows = this.db
      .prepare(`SELECT verse_id, taam_json FROM generated_taamim WHERE verse_id IN (${placeholders})`)
      .all(...verseIds) as Array<{ verse_id: string; taam_json: string }>;

    const patchRows = this.db
      .prepare(
        `SELECT verse_id, id, op_json, source_type, source_witness_id, author, note, created_at, seq_no FROM patches WHERE verse_id IN (${placeholders}) ORDER BY verse_id, seq_no ASC`,
      )
      .all(...verseIds) as Array<{
      verse_id: string;
      id: string;
      op_json: string;
      source_type: "manual" | "import" | "automation";
      source_witness_id: string | null;
      author: string;
      note: string | null;
      created_at: string;
      seq_no: number;
    }>;

    const stateRows = this.db
      .prepare(`SELECT verse_id, verified, flagged, manuscript_notes, patch_cursor FROM verse_state WHERE verse_id IN (${placeholders})`)
      .all(...verseIds) as Array<{
      verse_id: string;
      verified: number;
      flagged: number;
      manuscript_notes: string;
      patch_cursor: number;
    }>;

    const generatedMap = new Map(generatedRows.map((r) => [r.verse_id, r]));
    const patchMap = new Map<string, typeof patchRows>();
    for (const row of patchRows) {
      const existing = patchMap.get(row.verse_id) ?? [];
      existing.push(row);
      patchMap.set(row.verse_id, existing);
    }
    const stateMap = new Map(stateRows.map((r) => [r.verse_id, r]));

    return verseRows.map((vr) => {
      const verseId = vr.verse_id as VerseId;
      const generatedRow = generatedMap.get(vr.verse_id);
      const versePatches = patchMap.get(vr.verse_id) ?? [];
      const stateRow = stateMap.get(vr.verse_id);

      const verse: Verse = {
        id: verseId,
        hebrewTokens: JSON.parse(vr.hebrew_json),
        aramaicTokens: JSON.parse(vr.aramaic_json),
      };

      const generated: GeneratedTaam[] = generatedRow ? JSON.parse(generatedRow.taam_json) : [];

      const patches: PatchEntry[] = versePatches.map((row) => ({
        id: row.id,
        verseId,
        op: JSON.parse(row.op_json),
        sourceType: row.source_type,
        sourceWitnessId: row.source_witness_id,
        author: row.author,
        note: row.note ?? undefined,
        createdAt: row.created_at,
        seqNo: row.seq_no,
      }));

      const state: VerseState = {
        verified: Boolean(stateRow?.verified ?? 0),
        flagged: Boolean(stateRow?.flagged ?? 0),
        manuscriptNotes: stateRow?.manuscript_notes ?? "",
        patchCursor: stateRow?.patch_cursor ?? 0,
      };

      return { verse, generated, patches, state };
    });
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
