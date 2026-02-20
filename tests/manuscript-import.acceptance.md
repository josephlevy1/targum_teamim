# Manuscript Import Acceptance Checklist

## Scope
End-to-end checks for issues `#5`-`#37`.

## Scenarios
- [ ] Sync prioritized witnesses from `book_sources/book_list.csv`.
- [ ] Import pages for a witness and confirm metadata persists.
- [ ] Create region bbox and tag `Genesis:1:1` to `Genesis:1:5`.
- [ ] Run OCR and confirm artifact + job status recorded.
- [ ] Split region to witness verses and inspect diff artifacts.
- [ ] Recompute confidence and cascade; validate selected source + reason codes.
- [ ] Apply witness reading and confirm base text patch history.
- [ ] Undo/redo working text selection.
- [ ] Verify review queues (`low_confidence`, `disagreement`, `unavailable_partial`).
- [ ] Export working text, confidence JSON, and witness diffs.

## Determinism
- [ ] Run exports twice and confirm identical output for unchanged DB state.
