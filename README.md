# Targum Ta'amim MVP

Local-first Next.js + TypeScript monorepo for:
- ingesting Hebrew Torah (with ta'amim) and Aramaic Targum base text,
- auto-transposing ta'amim onto Aramaic,
- verse-level editing with patch history,
- exporting lossless JSON and Unicode text.

## Quick start

```bash
pnpm install
pnpm dev
```

## Import commands

Input format is TSV: `verse_id<TAB>text`

```bash
pnpm --filter web import:hebrew --file=/absolute/path/hebrew.tsv
pnpm --filter web import:targum --file=/absolute/path/targum.tsv
pnpm --filter web transpose --range=Genesis:1:1-Genesis:1:31
pnpm --filter web scrape:torah
pnpm --filter web run:torah --resume
```

## API routes

- `POST /api/import/hebrew`
- `POST /api/import/targum`
- `POST /api/transpose/:verseId`
- `GET /api/verse/:verseId`
- `POST /api/verse/:verseId/patch`
- `POST /api/verse/:verseId/undo`
- `POST /api/verse/:verseId/redo`
- `POST /api/verse/:verseId/reset`
- `POST /api/verse/:verseId/verify`
- `GET /api/export/json?range=...`
- `GET /api/export/unicode?range=...`

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
```

## taam.im deployment

For isolated self-hosting on `taam.im` (without touching any other hosted sites):

```bash
pnpm deploy:taam:setup
pnpm deploy:taam:check
```

Detailed runbook: `docs/deploy-taam-im.md`

## Authentication (Clerk)

Issue #2 uses Clerk for login/session handling.

Required environment variables in `apps/web/.env`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_xxx
CLERK_SECRET_KEY=sk_live_or_test_xxx
```

Behavior:
- read routes/pages remain public,
- verse mutation routes require login and return `401` when signed out,
- patch history stores the signed-in Clerk username (with fallback to email local-part, then user id prefix).
