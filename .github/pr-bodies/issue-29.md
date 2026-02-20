## Linked Issues
- Parent Epic: #46
- Child Issue: #29
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/29

## Scope
- Issue 8.1 — Export working Aramaic text (deterministic Unicode)
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Export canonical working Aramaic text by book/chapter with stable normalization.


### Acceptance
- [ ] Exported text is stable across repeated exports; includes verse IDs or structured output option.

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
