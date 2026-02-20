# Manuscript Issue Branch/PR Workflow

## Goal
Ship manuscript work as one branch + one PR per child issue (`#5`-`#37`) using `codex/issue-*` naming and mandatory checklists.

## 1) Generate PR bodies/checklists

```bash
bash scripts/manuscripts/generate-pr-bodies.sh
```

Output:
- `.github/pr-bodies/issue-5.md` ... `.github/pr-bodies/issue-37.md`

## 2) Create issue branch skeleton

```bash
bash scripts/manuscripts/create-issue-branch-pr.sh 5 core-entities-and-naming main
```

Then implement issue-only diff and commit:

```bash
git add -A
git commit -m "Issue 0.1 — Define core entities and naming conventions (#5)"
git push -u origin codex/issue-5-core-entities-and-naming
gh pr create \
  --base main \
  --head codex/issue-5-core-entities-and-naming \
  --title "Issue 0.1 — Define core entities and naming conventions (#5)" \
  --body-file .github/pr-bodies/issue-5.md
```

## 3) Source priority gate by issue range
- `#7`-`#19`: strict `P1 -> P12`.
- `#20`-`#31`: prove `P1-P2`, then expand to `P12`.
- `#32`-`#34`: tune on `P1-P2` first.
- `#35`-`#37`: include mandatory `P1-P2` + sampled lower priorities.

## 4) Next-issue queue
Use this fixed order:
`#5,#6,#7,#8,#9,#10,#11,#12,#13,#14,#15,#16,#17,#18,#19,#20,#21,#22,#23,#24,#25,#26,#27,#28,#29,#30,#31,#32,#33,#34,#35,#36,#37`

## 5) Batch artifacts for done-so-far + next issues
- Branch map: `docs/manuscript-issue-branch-map.csv`
- PR body/checklist files: `.github/pr-bodies/issue-<n>.md`
- PR command printer:

```bash
bash scripts/manuscripts/print-pr-create-commands.sh
```
