import postgres, { type Sql } from "postgres";
import type { GeneratedTaam, PatchEntry, Verse, VerseId, VerseState } from "@targum/core";
import type { VerseRecord } from "./db.js";

const CORE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS verses (
    verse_id TEXT PRIMARY KEY,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    hebrew_json TEXT NOT NULL,
    aramaic_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS generated_taamim (
    verse_id TEXT PRIMARY KEY REFERENCES verses(verse_id),
    taam_json TEXT NOT NULL,
    confidence_json TEXT NOT NULL,
    algo_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS patches (
    id TEXT PRIMARY KEY,
    verse_id TEXT NOT NULL REFERENCES verses(verse_id),
    op_json TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_witness_id TEXT,
    author TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    seq_no INTEGER NOT NULL,
    UNIQUE (verse_id, seq_no)
  );
  CREATE TABLE IF NOT EXISTS verse_state (
    verse_id TEXT PRIMARY KEY REFERENCES verses(verse_id),
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    flagged BOOLEAN NOT NULL DEFAULT FALSE,
    manuscript_notes TEXT NOT NULL DEFAULT '',
    patch_cursor INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_verses_book_chapter ON verses(book, chapter);
  CREATE INDEX IF NOT EXISTS idx_patches_verse_seq ON patches(verse_id, seq_no);
`;

type VerseRow = {
  verse_id: string;
  hebrew_json: string;
  aramaic_json: string;
};

type GeneratedRow = { verse_id: string; taam_json: string };
type PatchRow = {
  verse_id: string;
  id: string;
  op_json: string;
  source_type: "manual" | "import" | "automation";
  source_witness_id: string | null;
  author: string;
  note: string | null;
  created_at: string;
  seq_no: number;
};
type StateRow = {
  verse_id: string;
  verified: boolean;
  flagged: boolean;
  manuscript_notes: string;
  patch_cursor: number;
};

function toRecord(verseRow: VerseRow, generated: GeneratedRow | undefined, patches: PatchRow[], state: StateRow | undefined): VerseRecord {
  const verseId = verseRow.verse_id as VerseId;
  return {
    verse: {
      id: verseId,
      hebrewTokens: JSON.parse(verseRow.hebrew_json),
      aramaicTokens: JSON.parse(verseRow.aramaic_json),
    } satisfies Verse,
    generated: generated ? (JSON.parse(generated.taam_json) as GeneratedTaam[]) : [],
    patches: patches.map(
      (row) =>
        ({
          id: row.id,
          verseId,
          op: JSON.parse(row.op_json),
          sourceType: row.source_type,
          sourceWitnessId: row.source_witness_id,
          author: row.author,
          note: row.note ?? undefined,
          createdAt: row.created_at,
          seqNo: row.seq_no,
        }) satisfies PatchEntry,
    ),
    state: {
      verified: state?.verified ?? false,
      flagged: state?.flagged ?? false,
      manuscriptNotes: state?.manuscript_notes ?? "",
      patchCursor: state?.patch_cursor ?? 0,
    } satisfies VerseState,
  };
}

/**
 * Read-only Postgres adapter used by the public Vercel application. Mutating
 * OCR and manuscript operations remain on the local worker until their queue
 * and lease protocol is migrated.
 */
export class PostgresReadingRepository {
  private constructor(private readonly sql: Sql) {}

  static connect(connectionString: string): PostgresReadingRepository {
    return new PostgresReadingRepository(postgres(connectionString, { prepare: false, max: 3 }));
  }

  async initialize(): Promise<void> {
    await this.sql.unsafe(CORE_SCHEMA);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async listBooksAndChapters(): Promise<Array<{ book: string; chapter: number }>> {
    return this.sql<Array<{ book: string; chapter: number }>>`
      SELECT DISTINCT book, chapter FROM verses ORDER BY book, chapter
    `;
  }

  async listVerseIds(): Promise<VerseId[]> {
    const rows = await this.sql<Array<{ verse_id: string }>>`SELECT verse_id FROM verses`;
    return rows.map((row) => row.verse_id as VerseId);
  }

  async getVerseRecord(verseId: VerseId): Promise<VerseRecord | null> {
    const [verse] = await this.sql<VerseRow[]>`
      SELECT verse_id, hebrew_json, aramaic_json FROM verses WHERE verse_id = ${verseId}
    `;
    if (!verse) return null;

    const [generated, patches, states] = await Promise.all([
      this.sql<GeneratedRow[]>`SELECT verse_id, taam_json FROM generated_taamim WHERE verse_id = ${verseId}`,
      this.sql<PatchRow[]>`
        SELECT verse_id, id, op_json, source_type, source_witness_id, author, note, created_at::text, seq_no
        FROM patches WHERE verse_id = ${verseId} ORDER BY seq_no ASC
      `,
      this.sql<StateRow[]>`
        SELECT verse_id, verified, flagged, manuscript_notes, patch_cursor
        FROM verse_state WHERE verse_id = ${verseId}
      `,
    ]);
    return toRecord(verse, generated[0], patches, states[0]);
  }

  async getChapterRecords(book: string, chapter: number): Promise<VerseRecord[]> {
    const verses = await this.sql<VerseRow[]>`
      SELECT verse_id, hebrew_json, aramaic_json
      FROM verses WHERE book = ${book} AND chapter = ${chapter} ORDER BY verse
    `;
    if (verses.length === 0) return [];
    const ids = verses.map((row) => row.verse_id);
    const [generated, patches, states] = await Promise.all([
      this.sql<GeneratedRow[]>`SELECT verse_id, taam_json FROM generated_taamim WHERE verse_id = ANY(${ids})`,
      this.sql<PatchRow[]>`
        SELECT verse_id, id, op_json, source_type, source_witness_id, author, note, created_at::text, seq_no
        FROM patches WHERE verse_id = ANY(${ids}) ORDER BY verse_id, seq_no ASC
      `,
      this.sql<StateRow[]>`
        SELECT verse_id, verified, flagged, manuscript_notes, patch_cursor FROM verse_state WHERE verse_id = ANY(${ids})
      `,
    ]);
    const generatedByVerse = new Map(generated.map((row) => [row.verse_id, row]));
    const patchesByVerse = new Map<string, PatchRow[]>();
    for (const patch of patches) patchesByVerse.set(patch.verse_id, [...(patchesByVerse.get(patch.verse_id) ?? []), patch]);
    const stateByVerse = new Map(states.map((row) => [row.verse_id, row]));
    return verses.map((verse) => toRecord(verse, generatedByVerse.get(verse.verse_id), patchesByVerse.get(verse.verse_id) ?? [], stateByVerse.get(verse.verse_id)));
  }

  /** Idempotent writer used only by the local migration utility. */
  async upsertVerseRecord(record: VerseRecord): Promise<void> {
    const [book, chapter, verse] = record.verse.id.split(":");
    if (!book || !chapter || !verse) throw new Error(`Invalid verse id: ${record.verse.id}`);
    const now = new Date().toISOString();
    await this.sql.begin(async (sql) => {
      await sql`
        INSERT INTO verses (verse_id, book, chapter, verse, hebrew_json, aramaic_json, created_at, updated_at)
        VALUES (${record.verse.id}, ${book}, ${Number(chapter)}, ${Number(verse)}, ${JSON.stringify(record.verse.hebrewTokens)}, ${JSON.stringify(record.verse.aramaicTokens)}, ${now}, ${now})
        ON CONFLICT (verse_id) DO UPDATE SET
          hebrew_json = EXCLUDED.hebrew_json,
          aramaic_json = EXCLUDED.aramaic_json,
          updated_at = EXCLUDED.updated_at
      `;
      await sql`
        INSERT INTO verse_state (verse_id, verified, flagged, manuscript_notes, patch_cursor, updated_at)
        VALUES (${record.verse.id}, ${record.state.verified}, ${record.state.flagged}, ${record.state.manuscriptNotes}, ${record.state.patchCursor}, ${now})
        ON CONFLICT (verse_id) DO UPDATE SET
          verified = EXCLUDED.verified,
          flagged = EXCLUDED.flagged,
          manuscript_notes = EXCLUDED.manuscript_notes,
          patch_cursor = EXCLUDED.patch_cursor,
          updated_at = EXCLUDED.updated_at
      `;
      await sql`
        INSERT INTO generated_taamim (verse_id, taam_json, confidence_json, algo_version, created_at)
        VALUES (${record.verse.id}, ${JSON.stringify(record.generated)}, ${JSON.stringify(record.generated.map((item) => ({ taamId: item.taamId, confidence: item.confidence, reasons: item.reasons })))}, ${"v1"}, ${now})
        ON CONFLICT (verse_id) DO UPDATE SET
          taam_json = EXCLUDED.taam_json,
          confidence_json = EXCLUDED.confidence_json,
          created_at = EXCLUDED.created_at
      `;
      await sql`DELETE FROM patches WHERE verse_id = ${record.verse.id}`;
      for (const patch of record.patches) {
        await sql`
          INSERT INTO patches (id, verse_id, op_json, source_type, source_witness_id, author, note, created_at, seq_no)
          VALUES (${patch.id}, ${patch.verseId}, ${JSON.stringify(patch.op)}, ${patch.sourceType}, ${patch.sourceWitnessId ?? null}, ${patch.author}, ${patch.note ?? null}, ${patch.createdAt}, ${patch.seqNo})
        `;
      }
    });
  }
}

export { CORE_SCHEMA as POSTGRES_CORE_SCHEMA };
