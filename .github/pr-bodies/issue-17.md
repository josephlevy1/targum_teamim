## Linked Issues
- Parent Epic: #42
- Child Issue: #17
- Issue URL: https://github.com/josephlevy1/targum_teamim/issues/17

## Scope
- Issue 4.2 — Region-to-verse splitter using baseline alignment
- Source priority scope: P1 -> P12 (strict gate)

## Acceptance Criteria Checklist
> Copied from issue body; verify each item with evidence.


### Goal
Split region OCR covering a verse range into per-verse witness strings using baseline text alignment.


### Approach
- [ ] Concatenate baseline verses for the range.
- [ ] Align OCR stream to baseline stream.
- [ ] Infer verse boundaries; emit per-verse `WitnessVerse` candidates.


### Acceptance
- [ ] Given Gen 1:1–1:5 region, system produces 5 WitnessVerse records (or marks partial with reason).

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
