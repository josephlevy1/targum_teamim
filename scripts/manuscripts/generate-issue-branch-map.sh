#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_FILE="$ROOT_DIR/docs/manuscript-issue-branch-map.csv"

slugify() {
  local value="$1"
  value="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  value="$(echo "$value" | sed -E 's/issue [0-9]+\.[0-9]+[[:space:]]+[—-][[:space:]]+//g')"
  value="$(echo "$value" | sed -E 's/epic [0-9]+[[:space:]]+[—-][[:space:]]+//g')"
  value="$(echo "$value" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  echo "$value"
}

{
  echo "issue_number,title,branch_name,status"
  for issue in $(seq 5 37); do
    title="$(gh issue view "$issue" --json title -q .title)"
    slug="$(slugify "$title")"
    echo "$issue,\"$title\",codex/issue-$issue-$slug,planned"
  done
} > "$OUT_FILE"

echo "Wrote $OUT_FILE"
