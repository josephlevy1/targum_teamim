## Linked Issues
- Parent Epic: #38
- Child Issue: #5
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/5

## Scope
- Issue 0.1 — Define core entities and naming conventions
- Source priority scope: N/A

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Lock identifiers and verse ID scheme used across pipeline.


### Tasks
- [ ] Confirm canonical `verse_id` format (e.g., `Genesis:1:1`).
- [ ] Confirm witness IDs (`vatican_ms_*`, `hebrewbooks_*`, `baseline_digital`).
- [ ] Define normalization form (NFC or NFD) + mark ordering rules for export.


### Acceptance
- [ ] A single constants/config module defines verse ID parsing, witness IDs, normalization mode.

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
