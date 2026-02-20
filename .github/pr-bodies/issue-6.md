## Linked Issues
- Parent Epic: #38
- Child Issue: #6
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/6

## Scope
- Issue 0.2 — Add migrations/DB scaffolding for new tables
- Source priority scope: N/A

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Prepare persistent storage for pages, regions, witness verses, working verse selections, and base-text patches.


### Acceptance
- [ ] DB migration adds tables with indices on `verse_id`, `witness_id`, `page_id`, `status`.

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
