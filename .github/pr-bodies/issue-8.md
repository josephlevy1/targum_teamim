## Linked Issues
- Parent Epic: #39
- Child Issue: #8
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/8

## Scope
- Issue 1.2 — Page Image Import (directory ingest)
- Source priority scope: P1 -> P12 (strict gate)

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Import local folder of page images into a witness.


### Tasks
- [ ] Select directory, ingest file paths.
- [ ] Generate thumbnails and compute basic quality metrics (resolution, contrast heuristic).
- [ ] Persist Page records.


### Acceptance
- [ ] Imported pages appear with thumbnails; DB contains page metadata.

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
