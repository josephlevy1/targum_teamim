# Acceptance Checklist

1. Import Hebrew and Targum TSV files and confirm verses appear in `/api/verses`.
2. Run transpose for a verse and confirm generated ta'am sequence preserves Hebrew order.
3. Apply MOVE/SWAP/INSERT/DELETE operations via `/api/verse/:verseId/patch` and confirm patch history increments.
4. Verify undo/redo changes `patch_cursor` deterministically.
5. Export JSON and Unicode and confirm edited state is reflected.
