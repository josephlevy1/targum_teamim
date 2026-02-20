## Linked Issues
- Parent Epic: #43
- Child Issue: #20
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/20

## Scope
- Issue 5.1 — Per-witness-verse confidence model
- Source priority scope: P1-P2 first, then P3 -> P12

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Compute `source_confidence` using authority prior + clarity + match + completeness.


### Signals
- [ ] authority_weight (per witness)
- [ ] clarity_score (OCR mean conf, coverage)
- [ ] match_score (vs baseline)
- [ ] completeness_score (crop truncation heuristics / damaged flag)


### Acceptance
- [ ] `source_confidence` computed for each WitnessVerse and displayed.

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
