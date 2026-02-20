## Linked Issues
- Parent Epic: #40
- Child Issue: #11
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/11

## Scope
- Issue 2.2 — Tag regions with verse ranges + status
- Source priority scope: P1 -> P12 (strict gate)

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Each region gets `start_verse_id`, `end_verse_id`, and status `ok|damaged|unavailable`.


### Acceptance
- [ ] Region can be tagged Gen 1:1–1:5; damaged regions are excluded from processing by default.

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
