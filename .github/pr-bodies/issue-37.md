## Linked Issues
- Parent Epic: #48
- Child Issue: #37
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/37

## Scope
- Issue 10.3 — Test suite (unit + integration)
- Source priority scope: P1-P2 mandatory + sampled lower priorities

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Tests for normalization, alignment, confidence, cascade, and export stability.


### Acceptance
- [ ] CI passes; includes fixtures for a small Genesis sample.

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
