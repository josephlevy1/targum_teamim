## Linked Issues
- Parent Epic: #44
- Child Issue: #24
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/24

## Scope
- Issue 6.2 — Diff viewer component
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Render witness vs baseline vs working diffs quickly.


### Acceptance
- [ ] Diff renders in <200ms for typical verse; highlights insert/delete/replace spans.

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
