## Linked Issues
- Parent Epic: #42
- Child Issue: #19
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/19

## Scope
- Issue 4.4 — Manual boundary adjuster (fallback)
- Source priority scope: P1 -> P12 (strict gate)

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
If splitting fails or is partial, allow user to adjust verse boundaries within a region.


### Acceptance
- [ ] User can correct boundaries and re-run splitter to produce verse records.

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
