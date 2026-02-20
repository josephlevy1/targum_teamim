# Manuscript Operations Playbook

## 1) Asset Readiness Checklist
- Folder structure per witness:
  - `<witness>/raw-pages/`
  - `<witness>/missing-pages.csv`
  - `<witness>/damage-flags.csv`
  - `<witness>/coverage-map.csv`
- `coverage-map.csv` columns:
  - `page_index,start_verse_id,end_verse_id,coverage_status`
- `missing-pages.csv` columns:
  - `page_index,reason,expected_source`
- `damage-flags.csv` columns:
  - `page_index,region_hint,severity,notes`

## 2) Initial 10-20 Page Calibration
- Run a calibration pass on first 20 pages per new witness.
- For each page:
  - annotate regions
  - run OCR
  - split to verses
  - verify cascade output
- Record calibration metrics:
  - OCR mean confidence
  - split partial-rate
  - reviewer correction count per page

## 3) Reviewer Queue Playbook
- `Verified`: witness reading selected with confidence at or above threshold.
- `Keep baseline`: witness evidence is low-confidence or incomplete.
- `Accept witness`: manually promote witness reading and record note.
- Required reviewer note format:
  - `decision=<Verified|Keep baseline|Accept witness>;reason=<short reason>;page=<index>;region=<id>`

## 4) Scale-Up Batch + Failure Handling
- Batch size: 100 pages per witness per run.
- Stop batch if either condition is met:
  - OCR job failure rate > 15%
  - split partial-rate > 30%
- Failure runbook:
  - rerun failed OCR jobs once
  - re-tag problematic regions
  - escalate unresolved items to manual review queue

## 5) Weekly Reporting Template
- Throughput:
  - `pages_imported`
  - `regions_annotated`
  - `regions_ocr_completed`
- Queue health:
  - `low_confidence_queue_size`
  - `disagreement_queue_size`
  - `unavailable_partial_queue_size`
- Blockers:
  - unresolved priority gate blockers
  - unresolved data quality blockers
