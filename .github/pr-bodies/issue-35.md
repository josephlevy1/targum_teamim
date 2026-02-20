## Linked Issues
- Parent Epic: #48
- Child Issue: #35
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/35

## Scope
- Issue 10.1 — Job monitoring + retries
- Source priority scope: P1-P2 mandatory + sampled lower priorities

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Track OCR/splitting jobs and allow safe retries without duplicating artifacts.


### Acceptance
- [ ] Failed jobs show error; retry works; artifacts dedupe.

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
