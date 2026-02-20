## Linked Issues
- Parent Epic: #47
- Child Issue: #32
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/32

## Scope
- Issue 9.1 — Auto block detection (propose rectangles)
- Source priority scope: P1-P2 first for tuning, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Detect text blocks/lines and propose regions for user approval.


### Acceptance
- [ ] On a page, user can “Generate regions”; proposals appear; user edits and saves.

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
