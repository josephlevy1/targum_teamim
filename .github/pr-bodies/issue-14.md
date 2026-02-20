## Linked Issues
- Parent Epic: #41
- Child Issue: #14
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/14

## Scope
- Issue 3.2 — OCR runner (block OCR)
- Source priority scope: P1 -> P12 (strict gate)

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Run OCR on region crops; store raw text and OCR summary confidence.


### Tasks
- [ ] Implement local job queue (simple worker is fine).
- [ ] Persist `text_raw`, `ocr_mean_conf`, `ocr_char_count`, `coverage_ratio_est`.


### Acceptance
- [ ] For a tagged region, OCR completes and stores output.

## Data Integrity and Migration Notes
- Schema changes:
- Migration behavior:
- Rollback notes:

## Test Evidence
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] Targeted tests:
- [ ] Manual validation notes:

## Review Checklist (Required)
- [ ] Acceptance criteria matched to evidence.
- [ ] Raw vs normalized text separation preserved.
- [ ] No ta'amim workflow regression.
- [ ] Source-priority gate respected.
- [ ] Performance impact reviewed.
