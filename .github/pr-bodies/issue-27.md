## Linked Issues
- Parent Epic: #45
- Child Issue: #27
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/27

## Scope
- Issue 7.2 — Base text patches (audit trail)
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Record changes as patches (parallel to MOVE_TAAM):
- [ ] APPLY_WITNESS_READING
- [ ] REPLACE_VERSE_TEXT
- [ ] MANUAL_TEXT_EDIT (optional)


### Acceptance
- [ ] Patch history per verse shows who/when/what; reversible.

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
