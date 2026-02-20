## Linked Issues
- Parent Epic: #46
- Child Issue: #30
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/30

## Scope
- Issue 8.2 — Export confidence report (JSON)
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Export per-verse: selected source, ensemble confidence, source confidences, flags, availability.


### Acceptance
- [ ] JSON schema documented; matches UI values; usable for external QA.

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
