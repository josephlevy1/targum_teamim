# Manuscript Import Remaining Work TODO

Status date: 2026-02-20

## Operating Rules
- [ ] Use one branch and PR per item: `codex/todo-<n>-<slug>`
- [ ] Require 2 reviewer approvals before merge
- [ ] Every PR must include: linked issue, acceptance checklist, migration/data notes, test evidence
- [ ] Once PR is accepted and merged, delete both remote and local branch refs for that PR
- [ ] Keep existing ta'amim flows backward-compatible
- [ ] Apply source validation in strict order from `book_sources/book_list.csv` (P1 -> P12)

## Source Priority Gate (Hard Requirement)
- [ ] P1 `Biblia Vetus Testamentum Pentateuchus`
- [ ] P2 `Vat.ebr.19`
- [ ] P3 `Lisbon 45803`
- [ ] P4 `Venice 22405`
- [ ] P5 `Venice 42687`
- [ ] P6 `Chumash Sevyoniti`
- [ ] P7 `Sixth Biblia Rabbinica`
- [ ] P8 `Amsterdam 42117`
- [ ] P9 `Amsterdam 42118`
- [ ] P10 `Frankfurt 42329`
- [ ] P11 `Amsterdam 42735`
- [ ] P12 `Amsterdam 42071`

## TODO 1: Real Region Crop Pipeline (replace full-page copy)
- [ ] Implement true bbox crop in `apps/web/lib/manuscripts-pipeline.ts` using image processing (Sharp/libvips)
- [ ] Support JPG/PNG/WEBP/TIFF input and deterministic output format
- [ ] For PDF inputs, render page to raster before crop
- [ ] Validate bbox bounds and fail with explicit reason code when invalid
- [ ] Persist crop metadata (dimensions, source page dimensions, normalization details)
- [ ] Tests:
- [ ] Unit: bbox edge cases and deterministic output hash
- [ ] Integration: OCR stage consumes cropped artifact, not original full page

## TODO 2: Replace OCR Placeholder with Real OCR Runner
- [ ] Replace scaffold OCR (`baseline-scaffold-ocr`) with actual OCR engine integration
- [ ] Preserve `text_raw` exactly as engine output; keep normalization in compare layer only
- [ ] Store OCR confidence stats from engine output (mean confidence, coverage estimates)
- [ ] Add retry/backoff and structured errors per engine failure class
- [ ] Add config for engine selection and local runner constraints
- [ ] Tests:
- [ ] Unit: OCR result parser
- [ ] Integration: end-to-end `crop -> OCR -> artifact persistence`

## TODO 3: Thumbnail Generation + Rich Page Quality Metrics
- [ ] Generate and persist thumbnails during import (`thumbnail_path` non-null for image formats)
- [ ] Add quality metrics: width/height, DPI when available, blur/noise proxy, contrast proxy
- [ ] Keep PDF behavior explicit (thumbnail from first page raster or marked partial with reason)
- [ ] Add import summary counts by status (`ok`, `partial`, `unavailable`, `failed`)
- [ ] Tests:
- [ ] Unit: quality metric extraction
- [ ] Integration: import API returns thumbnail + expanded quality JSON

## TODO 4: True Draw-Rectangle Annotator UI
- [ ] Replace manual bbox numeric-only flow with visual drag-to-draw rectangles
- [ ] Keep numeric fields as advanced override, synchronized with drawn rectangle
- [ ] Add keyboard shortcuts for next/prev page and save region
- [ ] Add edit/delete handles for existing regions
- [ ] Ensure mobile-safe interaction fallback
- [ ] Tests:
- [ ] Component tests for draw/update/delete region
- [ ] Integration: saved bbox matches drawn coordinates

## TODO 5: Enforce P1 -> P12 Priority in Pipeline Execution
- [ ] Enforce source gating for ingest/OCR/split/confidence runs: lower priority blocked until higher priority pass criteria met
- [ ] Add persisted run-state checkpoints per witness/source priority
- [ ] Expose gating state and blockers in API/UI
- [ ] Prevent manual bypass except explicit admin override with audit log
- [ ] Tests:
- [ ] Unit: gating policy evaluator
- [ ] Integration: lower priority run rejected while higher priority pending/failed

## TODO 6: Upgrade Automation from Heuristic Stubs
- [ ] Replace heuristic block proposals with model-backed or CV-backed detection
- [ ] Replace fixed-window verse-range proposal with OCR+alignment based prediction
- [ ] Add training feedback persistence for accepted/rejected proposals
- [ ] Track proposal precision/recall over ground-truth pages
- [ ] Keep manual override first-class and fast
- [ ] Tests:
- [ ] Unit: proposal scoring and learning updates
- [ ] Integration: proposal quality improves on accepted sample set

## TODO 7: Reinstate PR Quality Gate Compliance
- [ ] Add branch protection requiring 2 approvals on `main`
- [ ] Add required status checks: `pnpm typecheck`, `pnpm test`
- [ ] Add PR template enforcing acceptance checklist + migration/data notes
- [ ] Add CI validation that rejects PRs missing required checklist sections
- [ ] Verify repository settings and document policy in `planning.md`

## TODO 8: Close Human-Dependency Operational Gaps
- [ ] Create manuscript asset readiness checklist (folder structure, coverage map, missing pages, damage flags)
- [ ] Run and document initial 10-20 page tagging calibration pass
- [ ] Define reviewer playbook for threshold queues (`Verified` / `Keep baseline` / `Accept witness`)
- [ ] Define scale-up batch plan and failure handling runbook
- [ ] Add weekly reporting for throughput, queue size, and unresolved blockers

## TODO 9: Ta'amim Patch Source Attribution
- [ ] Ensure every ta'amim mutation writes source attribution into patch history
- [ ] Required patch metadata: `source_type` (manual/import/automation), `source_witness_id` (if applicable), actor, timestamp, reason/note
- [ ] Backfill/migration strategy for existing ta'amim patches with missing source metadata
- [ ] Surface source attribution in patch history UI/API responses
- [ ] Tests:
- [ ] Unit: ta'amim patch creation includes required source fields
- [ ] Integration: ta'amim edit flows persist and return source attribution consistently

## PR/Test Sequence (Recommended)
- [ ] PR-A: TODO 1 + TODO 3 (artifact correctness foundation)
- [ ] PR-B: TODO 2 (real OCR)
- [ ] PR-C: TODO 4 (annotator UX)
- [ ] PR-D: TODO 5 (priority gate enforcement)
- [ ] PR-E: TODO 6 (automation quality)
- [ ] PR-F: TODO 7 (process gate hardening)
- [ ] PR-G: TODO 8 (operations handoff docs + runbooks)
- [ ] PR-H: TODO 9 (ta'amim source attribution in patch history)

## Global Exit Criteria
- [ ] Deterministic exports remain byte-stable across repeated runs
- [ ] Cascade behavior verified on P1/P2 first, then sequentially through P12
- [ ] Review queues are accurate and non-overlapping
- [ ] Undo/redo patch history remains reversible after new pipeline changes
- [ ] All required PR checks pass and policy gate is enforced
