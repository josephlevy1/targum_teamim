# Codex Planning & Build Prompt — taam.im Manuscript Import + Confidence Cascade

## Role
You are a senior engineer building a production-grade ingestion + alignment pipeline for scanned manuscript witnesses into an existing local web app (taam.im). The app already supports:
- Hebrew verse (read-only)
- Aramaic verse with an editable ta’amim layer
- “Transpose Again”, per-ta’am confidence, low-confidence queue
- Patch history for ta’am edits (e.g., MOVE_TAAM)
- Verse navigator with pending/verified/flagged

## Objective
Add a pipeline to import two scanned manuscript sources (page images) as *witnesses* for the Aramaic text (and later optionally for ta’amim), then compute:
- per-source confidence for each verse
- an overall/ensemble confidence
- a cascade selection of the “working Aramaic text” per verse:
  1) Vatican witness (highest authority)
  2) HebrewBooks witness
  3) existing baseline digital Aramaic (already imported; current setup)
- Vatican and Hebrewbooks can be found in /book_sources with /book_sources/book_list.csv providing the prioritization for sources and the source details

The system must tolerate missing/ripped pages and proceed with fallbacks automatically.

## Constraints / Inputs
- Vatican + HebrewBooks are **scanned images only**, no transcription.
- Manuscripts include **ta’amim but not niqqud** (letters + ta’amim marks).
- Scans are **page images** stored locally (directories), layout is “relatively consistent” but with damage/missing parts.
- Must be able to “move on” when scan data is unavailable.
- MVP can use **manual crop tagging**, but must include a path to **automated tagging**.

## Editorial / Publication Direction
Start with **one canonical working Aramaic text** per verse (Option A), while storing witness texts + diffs so a variants apparatus can be added later without rework.

## Deliverables (what you must implement)
### 1) Data model
Add `Witness` and `WitnessVerse` concepts.

**Witness**
- id, name, type (`scanned_images`, `ocr_text`, `digital_text`)
- authority_weight (Vatican > HebrewBooks > Baseline)
- metadata: coverage, notes

**Page**
- witness_id, page_id, image_path, quality metrics, status

**PageRegion**
- page_id, region_id, bbox (x,y,w,h), verse_range (start_verse_id, end_verse_id), status

**WitnessVerse**
- verse_id, witness_id
- text_raw (OCR output), text_normalized
- metrics: clarity_score, match_score, language_score (optional), completeness_score
- source_confidence, status (`ok`, `partial`, `unavailable`, `failed`)
- alignment artifact: token diff ops / mapping

**WorkingVerseText**
- verse_id
- selected_source (`vatican` | `hebrewbooks` | `baseline`)
- selected_text_normalized + selected_text_surface
- ensemble_confidence
- flags: disagreement, low_confidence, unavailable_sources
- patch history for base text edits (similar to ta’am patches)

### 2) UX / UI
Add these screens/panels:

**A) Import Wizard**
- choose witness
- import directory of page images
- create Page records + thumbnails

**B) Page Annotator (MVP)**
- show page image
- draw rectangles for text blocks
- tag each region with a verse range (e.g., Gen 1:1–1:5)
- mark region/page as damaged/unusable when needed

**C) Verse Witness Panel (per verse in editor)**
- show witness list with per-source confidence + components (clarity/match/completeness)
- show diffs (witness vs baseline vs working)
- show which source is selected by cascade

**D) Review Queues**
- filters for:
  - “Low text confidence”
  - “Scan disagreement”
  - “Unavailable/partial in scans”
- keep separate from existing “Low ta’am confidence” queue

### 3) OCR + processing pipeline
Implement as background jobs (local runner is fine).

**Stage 1 — OCR on PageRegion crops**
- crop image to bbox
- run OCR -> raw text + OCR confidence stats
- store raw text + summary confidence

**Stage 2 — normalization**
- deterministic Unicode normalization (pick NFC or NFD and use consistently)
- normalize punctuation/spacing for comparison layer only
- do not overwrite raw

**Stage 3 — verse splitting within region**
Each region covers a verse range. Split OCR region text into per-verse strings using the baseline digital Aramaic as scaffold:
- align OCR text against concatenated baseline text for that range
- infer verse boundaries
- if splitting fails, mark as `partial` and surface for manual boundary adjustment (lightweight UI)

**Stage 4 — alignment + diff**
Compute token + char alignment between:
- witness verse text vs baseline verse text
Store:
- edit distance metrics
- diff ops (insert/delete/substitute spans)

### 4) Confidence model (must match user intent)
Compute `source_confidence` per witness-verse using:
- authority prior (per witness)
- clarity (OCR average conf, coverage ratio, page quality)
- match (agreement vs baseline and/or other witness)
- completeness (detect truncated crops, ripped areas)

Then compute `ensemble_confidence` for the selected working text using corroboration:
- boost if Vatican + HebrewBooks agree (within tolerance)
- flag “disagreement” if high-confidence sources differ materially (treat as review/variant candidate)

### 5) Cascade selection logic
Per verse:
- choose Vatican if `source_confidence >= T_vatican_min`
- else choose HebrewBooks if `>= T_hb_min`
- else choose baseline
Output:
- selected source
- ensemble confidence
- reason codes (e.g., `VATICAN_LOW_CLARITY`, `HB_UNAVAILABLE`, `DISAGREEMENT_FLAG`)

### 6) Editing + patching the base text
Allow user to accept witness reading as working text or keep baseline.
Store changes as patches (similar spirit to MOVE_TAAM):
- REPLACE_VERSE_TEXT
- APPLY_WITNESS_READING
- MANUAL_TEXT_EDIT (optional granular later)

Must support undo/redo or at least reversible patch history per verse.

### 7) Automation path (post-MVP)
Implement two incremental improvements:

**(1) Auto block detection**
- detect text blocks/lines on page and propose rectangles
- user approves/adjusts (cuts manual effort massively)

**(2) Auto verse-range proposals**
- OCR whole page (rough)
- align to baseline to propose likely verse ranges for blocks
- user confirms/adjusts boundaries

## Acceptance criteria (tests)
- Import a directory of page images into a Witness.
- Annotate a page with one region tagged Gen 1:1–1:5.
- OCR region runs and produces extracted text + clarity metrics.
- Region text is split into verse-level witness texts aligned to baseline.
- Verse view shows witness confidences and a diff.
- Cascade selects Vatican/HebrewBooks/baseline according to thresholds.
- Verses with missing/damaged data are marked unavailable and do not block.
- Review queue lists verses under confidence thresholds.
- User can accept witness reading; patch history reflects the change.
- Export produces deterministic Unicode working text plus a confidence report JSON.

## Implementation notes (important)
- Treat manuscripts as witnesses; never silently overwrite working text.
- Keep raw vs normalized representations separate.
- Prefer modular job runners so OCR engine can be swapped.
- Optimize UX for high-volume work: keyboard shortcuts, batch operations, fast diff toggles.
- Do not attempt ta’amim-from-scan extraction in MVP unless OCR proves reliable; keep it as Phase 4.

## Questions you should ask ONLY if blocking
- What is the exact baseline digital Aramaic source currently imported?
- Any known page→book/chapter mapping metadata for the image sets?
If not provided, build tools/UI to capture mapping iteratively.

## PR Quality Gate Policy (2026-02-20)
- Branch protection on `main` should require at least 2 approving reviews.
- Required checks on `main`: `PR Quality Gate / quality-checks`, `PR Quality Gate / validate-pr-body`.
- PRs must use `.github/pull_request_template.md` sections:
  - `Acceptance Criteria Checklist`
  - `Migration / Data Notes`
  - `Test Evidence`
- CI enforces `pnpm typecheck` and `pnpm test` on every pull request.
