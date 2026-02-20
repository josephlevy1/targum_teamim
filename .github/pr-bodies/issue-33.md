## Linked Issues
- Parent Epic: #47
- Child Issue: #33
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/33

## Scope
- Issue 9.2 — Auto verse-range proposal (OCR page + align)
- Source priority scope: P1-P2 first for tuning, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Rough OCR full page, align to baseline to propose verse ranges for regions.


### Acceptance
- [ ] System proposes plausible verse spans; user can correct; improves throughput vs manual tagging.

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
