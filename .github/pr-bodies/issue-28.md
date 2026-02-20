## Linked Issues
- Parent Epic: #45
- Child Issue: #28
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/28

## Scope
- Issue 7.3 — Undo/redo for base text selection/edits (MVP)
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Basic undo/redo for base-text operations.


### Acceptance
- [ ] Undo returns to prior working text selection; redo re-applies.

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
