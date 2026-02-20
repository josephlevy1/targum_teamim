## Linked Issues
- Parent Epic: #43
- Child Issue: #21
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/21

## Scope
- Issue 5.2 — Ensemble confidence + disagreement detection
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Compute `ensemble_confidence` for selected working text and flag disagreements among high-confidence witnesses.


### Acceptance
- [ ] If Vatican and HebrewBooks both high-confidence but differ materially, verse gets `DISAGREEMENT_FLAG`.

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
