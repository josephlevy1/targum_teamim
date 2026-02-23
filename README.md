# Targum Ta'amim

Local-first TypeScript monorepo for ingesting Hebrew + Targum text, generating ta'amim placement on Aramaic, reviewing/editing at verse level, and exporting edited results.

## What it includes

- Next.js web app for verse editing and chapter reading.
- SQLite-backed storage (`data/app.db`) with patch history, undo/redo, verify/flag state.
- Import tools for TSV and a full-Torah scrape pipeline.
- Export endpoints for JSON and rendered Unicode text.
- Optional Clerk auth: reads stay public, write actions require sign-in.

## Repository layout

- `apps/web`: Next.js app (`/` editor view, `/reading` reading view) + API routes + import scripts.
- `packages/core`: parsing, transpose engine, Unicode renderer, patch operations.
- `packages/storage`: SQLite repository implementation.
- `config`: ta'amim map + transpose rules.
- `data`: database and import artifacts.
- `scripts`: production/deploy/ops shell scripts.

## Prerequisites

- Node.js `22.x` (`.nvmrc`)
- pnpm `9.15.4+`

```bash
nvm install
nvm use
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

## Local development

```bash
pnpm dev
```

App runs at `http://localhost:3000`.

## Environment

Create/update `apps/web/.env`:

```bash
# Server binding
PORT=3000
HOSTNAME=0.0.0.0

# Clerk (required for mutation APIs)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_xxx
CLERK_SECRET_KEY=sk_live_or_test_xxx
```

If Clerk keys are missing, mutation endpoints return auth-unavailable (`503`).

## Data import and generation

Input format: TSV with `verse_id<TAB>text` (example verse id: `Genesis:1:1`).

### Import from local TSV

```bash
pnpm --filter web import:hebrew --file=/absolute/path/hebrew.tsv
pnpm --filter web import:targum --file=/absolute/path/targum.tsv
pnpm --filter web transpose --range=Genesis:1:1-Genesis:1:31
```

### Full Torah pipeline

```bash
# scrape + write data/imports/hebrew_torah.tsv and targum_torah.tsv
pnpm --filter web scrape:torah

# end-to-end run with checkpointing/resume
pnpm --filter web run:torah --resume
```

Useful flags:

- `--books=Genesis,Exodus`
- `--chapters=1-3`
- `--delay-ms=500`
- `--retries=3`
- `--no-cache`
- `--force`

Pipeline artifacts are saved under `data/imports/` (manifest, TSV outputs, checkpoint, cache).

## HTTP API

Read endpoints (public):

- `GET /api/verses`
- `GET /api/verse/:verseId`
- `GET /api/reading?book=Genesis&chapter=1`
- `GET /api/export/json?range=Genesis:1:1-Genesis:1:31`
- `GET /api/export/unicode?range=Genesis:1:1-Genesis:1:31`
- `GET /api/manuscripts/sources`
- `GET /api/manuscripts/witnesses`
- `GET /api/manuscripts/pages?witnessId=<id>`
- `GET /api/manuscripts/regions?pageId=<id>`
- `GET /api/manuscripts/progress?witnessId=<id>`

Import endpoints:

- `POST /api/import/hebrew` with `{ "content": "Genesis:1:1\t..." }`
- `POST /api/import/targum` with `{ "content": "Genesis:1:1\t..." }`

Mutation endpoints (Clerk sign-in required):

- `POST /api/transpose/:verseId`
- `POST /api/verse/:verseId/patch`
- `POST /api/verse/:verseId/undo`
- `POST /api/verse/:verseId/redo`
- `POST /api/verse/:verseId/reset`
- `POST /api/verse/:verseId/verify`
- `POST /api/verse/:verseId/flag`
- `POST /api/manuscripts/witnesses` (`action=sync_book_list` or create witness)
- `POST /api/manuscripts/pages/import`
- `POST /api/manuscripts/regions`
- `DELETE /api/manuscripts/regions/:regionId`
- `POST /api/manuscripts/ocr/run`
- `POST /api/manuscripts/split/run`
- `POST /api/manuscripts/confidence/recompute`
- `POST /api/manuscripts/cascade/recompute`
- `POST /api/manuscripts/verse/:verseId/select`
- `POST /api/manuscripts/verse/:verseId/undo`
- `POST /api/manuscripts/verse/:verseId/redo`
- `POST /api/manuscripts/regions/:regionId/split`

Manuscript exports/review:

- `GET /api/manuscripts/verse/:verseId/witnesses`
- `GET /api/manuscripts/verse/:verseId/patches`
- `GET /api/manuscripts/review-queue?filter=low_confidence|disagreement|unavailable_partial`
- `GET /api/manuscripts/export/working-text`
- `GET /api/manuscripts/export/confidence`
- `GET /api/manuscripts/export/diffs`
- `GET /api/manuscripts/jobs/ocr`
- `POST /api/manuscripts/retag/remap`
- `POST /api/manuscripts/taamim/align/run`
- `POST /api/manuscripts/taamim/cascade/recompute`
- `GET /api/manuscripts/verse/:verseId/taamim/witnesses`
- `GET /api/manuscripts/verse/:verseId/taamim/consensus`
- `POST /api/manuscripts/verse/:verseId/taamim/apply-consensus`
- `GET /api/manuscripts/monitoring/summary`
- `GET /api/manuscripts/monitoring/jobs`
- `GET /api/manuscripts/monitoring/system`

When signed out, mutation routes return `401`. Patch entries are attributed to Clerk username (fallback to email local-part, then user-id prefix).

## Quality checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Production / taam.im

```bash
pnpm start:prod
pnpm stop:prod
pnpm backup
```

Cloudflare tunnel + uptime checks:

```bash
pnpm deploy:taam:setup
pnpm deploy:taam:check
pnpm pm2:startup:setup
```

Runbooks:

- `docs/issue-1-mac-mini-uptime.md`
- `docs/next-steps-issue2.md`
- `docs/m1-8gb-runtime-profile.md`
