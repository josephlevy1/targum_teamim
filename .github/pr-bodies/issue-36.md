## Linked Issues
- Parent Epic: #48
- Child Issue: #36
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/36

## Scope
- Issue 10.2 — Caching + performance
- Source priority scope: P1-P2 mandatory + sampled lower priorities

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Ensure page viewing, diffs, and verse navigation remain fast at scale.


### Acceptance
- [ ] 5k+ verses and thousands of pages remain responsive; no major UI stalls.

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
