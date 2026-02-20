# Manuscript Import Remaining Work TODO

Status date: 2026-02-20

## Operating Rules
- [ ] Use one branch and PR per item: `codex/todo-<n>-<slug>`
- [ ] Require 2 reviewer approvals before merge
- [ ] Every PR must include: linked issue, acceptance checklist, migration/data notes, test evidence
- [ ] Once PR is accepted and merged, delete both remote and local branch refs for that PR
- [x] Keep existing ta'amim flows backward-compatible
- [x] Apply source validation in strict order from `book_sources/book_list.csv` (P1 -> P12)

## Source Priority Gate (Hard Requirement)
- [x] P1 `Biblia Vetus Testamentum Pentateuchus`
- [x] P2 `Vat.ebr.19`
- [x] P3 `Lisbon 45803`
- [x] P4 `Venice 22405`
- [x] P5 `Venice 42687`
- [x] P6 `Chumash Sevyoniti`
- [x] P7 `Sixth Biblia Rabbinica`
- [x] P8 `Amsterdam 42117`
- [x] P9 `Amsterdam 42118`
- [x] P10 `Frankfurt 42329`
- [x] P11 `Amsterdam 42735`
- [x] P12 `Amsterdam 42071`

## TODO 1: Real Region Crop Pipeline (replace full-page copy)
- [x] Implement true bbox crop in `apps/web/lib/manuscripts-pipeline.ts` using image processing (Sharp/libvips)
- [x] Support JPG/PNG/WEBP/TIFF input and deterministic output format
- [x] For PDF inputs, render page to raster before crop
- [x] Validate bbox bounds and fail with explicit reason code when invalid
- [x] Persist crop metadata (dimensions, source page dimensions, normalization details)
- [ ] Tests:
- [x] Unit: bbox edge cases and deterministic output hash
- [x] Integration: OCR stage consumes cropped artifact, not original full page

## TODO 2: Replace OCR Placeholder with Real OCR Runner
- [x] Replace scaffold OCR (`baseline-scaffold-ocr`) with actual OCR engine integration
- [x] Preserve `text_raw` exactly as engine output; keep normalization in compare layer only
- [x] Store OCR confidence stats from engine output (mean confidence, coverage estimates)
- [x] Add retry/backoff and structured errors per engine failure class
- [x] Add config for engine selection and local runner constraints
- [ ] Tests:
- [x] Unit: OCR result parser
- [x] Integration: end-to-end `crop -> OCR -> artifact persistence`

## TODO 3: Thumbnail Generation + Rich Page Quality Metrics
- [x] Generate and persist thumbnails during import (`thumbnail_path` non-null for image formats)
- [x] Add quality metrics: width/height, DPI when available, blur/noise proxy, contrast proxy
- [x] Keep PDF behavior explicit (thumbnail from first page raster or marked partial with reason)
- [x] Add import summary counts by status (`ok`, `partial`, `unavailable`, `failed`)
- [ ] Tests:
- [x] Unit: quality metric extraction
- [x] Integration: import API returns thumbnail + expanded quality JSON

## TODO 4: True Draw-Rectangle Annotator UI
- [x] Replace manual bbox numeric-only flow with visual drag-to-draw rectangles
- [x] Keep numeric fields as advanced override, synchronized with drawn rectangle
- [x] Add keyboard shortcuts for next/prev page and save region
- [x] Add edit/delete handles for existing regions
- [x] Ensure mobile-safe interaction fallback
- [ ] Tests:
- [ ] Component tests for draw/update/delete region
- [ ] Integration: saved bbox matches drawn coordinates

## TODO 5: Enforce P1 -> P12 Priority in Pipeline Execution
- [x] Enforce source gating for ingest/OCR/split/confidence runs: lower priority blocked until higher priority pass criteria met
- [x] Add persisted run-state checkpoints per witness/source priority
- [x] Expose gating state and blockers in API/UI
- [x] Prevent manual bypass except explicit admin override with audit log
- [ ] Tests:
- [ ] Unit: gating policy evaluator
- [ ] Integration: lower priority run rejected while higher priority pending/failed

## TODO 6: Upgrade Automation from Heuristic Stubs
- [x] Replace heuristic block proposals with model-backed or CV-backed detection
- [x] Replace fixed-window verse-range proposal with OCR+alignment based prediction
- [x] Add training feedback persistence for accepted/rejected proposals
- [x] Track proposal precision/recall over ground-truth pages
- [x] Keep manual override first-class and fast
- [ ] Tests:
- [x] Unit: proposal scoring and learning updates
- [ ] Integration: proposal quality improves on accepted sample set

## TODO 7: Reinstate PR Quality Gate Compliance
- [ ] Add branch protection requiring 2 approvals on `main`
- [x] Add required status checks: `pnpm typecheck`, `pnpm test`
- [x] Add PR template enforcing acceptance checklist + migration/data notes
- [x] Add CI validation that rejects PRs missing required checklist sections
- [ ] Verify repository settings and document policy in `planning.md`

## TODO 8: Close Human-Dependency Operational Gaps
- [x] Create manuscript asset readiness checklist (folder structure, coverage map, missing pages, damage flags)
- [ ] Run and document initial 10-20 page tagging calibration pass
- [x] Define reviewer playbook for threshold queues (`Verified` / `Keep baseline` / `Accept witness`)
- [x] Define scale-up batch plan and failure handling runbook
- [x] Add weekly reporting for throughput, queue size, and unresolved blockers

## TODO 9: Ta'amim Patch Source Attribution
- [x] Ensure every ta'amim mutation writes source attribution into patch history
- [x] Required patch metadata: `source_type` (manual/import/automation), `source_witness_id` (if applicable), actor, timestamp, reason/note
- [x] Backfill/migration strategy for existing ta'amim patches with missing source metadata
- [x] Surface source attribution in patch history UI/API responses
- [ ] Tests:
- [x] Unit: ta'amim patch creation includes required source fields
- [x] Integration: ta'amim edit flows persist and return source attribution consistently

## PR/Test Sequence (Recommended)
- [x] PR-A: TODO 1 + TODO 3 (artifact correctness foundation)
- [x] PR-B: TODO 2 (real OCR)
- [x] PR-C: TODO 4 (annotator UX)
- [x] PR-D: TODO 5 (priority gate enforcement)
- [x] PR-E: TODO 6 (automation quality)
- [x] PR-F: TODO 7 (process gate hardening)
- [x] PR-G: TODO 8 (operations handoff docs + runbooks)
- [x] PR-H: TODO 9 (ta'amim source attribution in patch history)

## Global Exit Criteria
- [ ] Deterministic exports remain byte-stable across repeated runs
- [ ] Cascade behavior verified on P1/P2 first, then sequentially through P12
- [x] Review queues are accurate and non-overlapping
- [x] Undo/redo patch history remains reversible after new pipeline changes
- [ ] All required PR checks pass and policy gate is enforced

## Open Items (Remaining)
- [ ] Configure GitHub branch protection for `main` with required 2 approvals (repo settings change).
- [ ] Verify branch protection + required checks are active in GitHub settings (external verification).
- [ ] Run and document the initial real 10-20 page calibration pass with actual manuscript assets.
- [ ] Add component tests for visual draw/update/delete region interactions.
- [ ] Add integration test for saved bbox-to-drawn-coordinate equivalence.
- [ ] Add unit test for gating policy evaluator edge cases (all blocker states + override).
- [ ] Add integration test proving lower-priority witness rejection while higher-priority is pending/failed.
- [ ] Add integration test proving automation proposal quality improvement on accepted sample set.
- [ ] Validate byte-stable deterministic exports across repeated full runs.
- [ ] Run sequential cascade verification through P1 -> P12 using real witness data.
- [ ] Confirm CI required checks are enforced in branch protection (not only present as workflow files).
