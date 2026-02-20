## Linked Issues
- Parent Epic: #45
- Child Issue: #26
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/26

## Scope
- Issue 7.1 — Working verse text persistence
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Store per-verse selected working text and its provenance.


### Acceptance
- [ ] On selection change, DB updates selected_source + selected text snapshot + confidence.

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
