## Linked Issues
- Parent Epic: #43
- Child Issue: #22
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/22

## Scope
- Issue 5.3 — Cascade selector (Vatican → HebrewBooks → baseline)
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Choose `WorkingVerseText.selected_source` with thresholds and reason codes.


### Acceptance
- [ ] Configurable `T_vatican_min`, `T_hb_min`; selection behaves as specified; reason codes recorded.

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
