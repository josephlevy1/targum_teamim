## Linked Issues
- Parent Epic: #44
- Child Issue: #25
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/25

## Scope
- Issue 6.3 — Review queues integration
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Add new queues separate from ta’am queues:
- [ ] Low text confidence
- [ ] Disagreement
- [ ] Unavailable/partial scans


### Acceptance
- [ ] Filters exist in Verse Navigator/Review mode; clicking item navigates to verse.

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
