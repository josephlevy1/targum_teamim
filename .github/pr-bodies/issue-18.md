## Linked Issues
- Parent Epic: #42
- Child Issue: #18
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/18

## Scope
- Issue 4.3 — Alignment metrics + diff artifacts (witness vs baseline)
- Source priority scope: P1 -> P12 (strict gate)

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Compute token and char-level metrics + store diff ops.


### Acceptance
- [ ] `match_score`, edit distance, and diff ops stored; can render a diff view.

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
