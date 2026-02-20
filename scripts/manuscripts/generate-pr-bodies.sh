#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/.github/pr-bodies"
mkdir -p "$OUT_DIR"

epic_for_issue() {
  local issue="$1"
  if (( issue >= 5 && issue <= 6 )); then echo "38"; return; fi
  if (( issue >= 7 && issue <= 9 )); then echo "39"; return; fi
  if (( issue >= 10 && issue <= 12 )); then echo "40"; return; fi
  if (( issue >= 13 && issue <= 15 )); then echo "41"; return; fi
  if (( issue >= 16 && issue <= 19 )); then echo "42"; return; fi
  if (( issue >= 20 && issue <= 22 )); then echo "43"; return; fi
  if (( issue >= 23 && issue <= 25 )); then echo "44"; return; fi
  if (( issue >= 26 && issue <= 28 )); then echo "45"; return; fi
  if (( issue >= 29 && issue <= 31 )); then echo "46"; return; fi
  if (( issue >= 32 && issue <= 34 )); then echo "47"; return; fi
  if (( issue >= 35 && issue <= 37 )); then echo "48"; return; fi
  echo ""
}

priority_scope_for_issue() {
  local issue="$1"
  if (( issue <= 6 )); then echo "N/A"; return; fi
  if (( issue >= 7 && issue <= 19 )); then echo "P1 -> P12 (strict gate)"; return; fi
  if (( issue >= 20 && issue <= 31 )); then echo "P1-P2 first, then P3 -> P12"; return; fi
  if (( issue >= 32 && issue <= 34 )); then echo "P1-P2 first for tuning, then P3 -> P12"; return; fi
  echo "P1-P2 mandatory + sampled lower priorities"
}

for issue in $(seq 5 37); do
  data="$(gh issue view "$issue" --json number,title,body,url)"
  title="$(jq -r '.title' <<<"$data")"
  url="$(jq -r '.url' <<<"$data")"
  body="$(jq -r '.body // ""' <<<"$data")"
  epic="$(epic_for_issue "$issue")"
  priority_scope="$(priority_scope_for_issue "$issue")"

  out_file="$OUT_DIR/issue-$issue.md"
  {
    echo "## Linked Issues"
    echo "- Parent Epic: #$epic"
    echo "- Child Issue: #$issue"
    echo "- Issue URL: $url"
    echo
    echo "## Scope"
    echo "- $title"
    echo "- Source priority scope: $priority_scope"
    echo
    echo "## Acceptance Criteria Checklist"
    echo "> Copied from issue body; verify each item with evidence."
    echo
    if [[ -n "$body" ]]; then
      while IFS= read -r line; do
        if [[ "$line" =~ ^##[[:space:]] ]]; then
          echo
          echo "### ${line#\#\# }"
          continue
        fi
        if [[ "$line" =~ ^-[[:space:]] ]]; then
          echo "- [ ] ${line#- }"
        elif [[ -n "$line" ]]; then
          echo "$line"
        else
          echo
        fi
      done <<<"$body"
    else
      echo "- [ ] (No body found)"
    fi
    echo
    echo "## Data Integrity and Migration Notes"
    echo "- Schema changes:"
    echo "- Migration behavior:"
    echo "- Rollback notes:"
    echo
    echo "## Test Evidence"
    echo "- [ ] \`pnpm typecheck\`"
    echo "- [ ] \`pnpm test\`"
    echo "- [ ] Targeted tests:"
    echo "- [ ] Manual validation notes:"
    echo
    echo "## Review Checklist (Required)"
    echo "- [ ] Acceptance criteria matched to evidence."
    echo "- [ ] Raw vs normalized text separation preserved."
    echo "- [ ] No ta'amim workflow regression."
    echo "- [ ] Source-priority gate respected."
    echo "- [ ] Performance impact reviewed."
  } >"$out_file"
done

echo "Generated PR body files in $OUT_DIR"
