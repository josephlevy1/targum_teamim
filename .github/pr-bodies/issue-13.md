## Linked Issues
- Parent Epic: #41
- Child Issue: #13
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/13

## Scope
- Issue 3.1 — Crop pipeline for regions
- Source priority scope: P1 -> P12 (strict gate)

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Generate crop images for each PageRegion (deterministic filenames/IDs).


### Acceptance
- [ ] Crop files created, linked to region IDs; re-running does not duplicate incorrectly.

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
