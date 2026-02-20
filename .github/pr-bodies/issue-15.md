## Linked Issues
- Parent Epic: #41
- Child Issue: #15
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/15

## Scope
- Issue 3.3 — Normalization module
- Source priority scope: P1 -> P12 (strict gate)

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Produce `text_normalized` from raw OCR text for comparison only.


### Acceptance
- [ ] Normalized output is deterministic; raw remains unchanged; unit tests cover key cases.

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
