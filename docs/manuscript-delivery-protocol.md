# Manuscript Import Delivery Protocol

## Branch and PR rules
- Branch format: `codex/issue-<issue-number>-<slug>`.
- One PR per child issue (`#5` through `#37`).
- Merge requires 2 approvals and completed PR checklist.

## Execution order
1. `#5` -> `#6`
2. `#7` -> `#12`
3. `#13` -> `#15`
4. `#16` -> `#19`
5. `#20` -> `#22`
6. `#23` -> `#25`
7. `#26` -> `#28`
8. `#29` -> `#31`
9. `#32` -> `#34`
10. `#35` -> `#37`

## Hard source priority gate
1. Biblia Vetus Testamentum Pentateuchus (priority 1)
2. Vat.ebr.19 (priority 2)
3. Lisbon 45803 (priority 3)
4. Venice 22405 (priority 4)
5. Venice 42687 (priority 5)
6. Chumash Sevyoniti (priority 6)
7. Sixth Biblia Rabbinica (priority 7)
8. Amsterdam 42117 (priority 8)
9. Amsterdam 42118 (priority 9)
10. Frankfurt 42329 (priority 10)
11. Amsterdam 42735 (priority 11)
12. Amsterdam 42071 (priority 12)

## Acceptance policy
- For `#7`-`#19`: validate in strict priority order `P1` -> `P12`.
- For `#20`-`#31`: prove with `P1`-`P2`, then expand sequentially.
- For `#32`-`#34`: tune automation first on `P1`-`P2`.
- For `#35`-`#37`: include mandatory `P1`-`P2` plus sampled lower priorities.
