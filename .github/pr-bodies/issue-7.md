## Linked Issues
- Parent Epic: #39
- Child Issue: #7
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/7

## Scope
- Issue 1.1 — Witness Registry UI + API
- Source priority scope: P1 -> P12 (strict gate)

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Create/edit witnesses with authority weights and metadata.


### UI
- [ ] Add witness: name, type, authority_weight, coverage notes.


### Acceptance
- [ ] User can create Vatican + HebrewBooks witnesses and see them in a list.

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
