## Linked Issues
- Parent Epic: #44
- Child Issue: #23
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/23

## Scope
- Issue 6.1 — Witness panel in verse editor
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
In existing verse editor, show witness list with confidence breakdown and selection.


### UI
- [ ] Vatican/HB/Baseline rows: confidence, clarity, match, completeness, status
- [ ] Buttons: “View diff”, “Use this reading”


### Acceptance
- [ ] User can view witness data for current verse and switch selected reading.

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
