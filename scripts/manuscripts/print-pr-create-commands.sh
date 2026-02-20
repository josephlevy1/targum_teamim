#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MAP_FILE="$ROOT_DIR/docs/manuscript-issue-branch-map.csv"

if [[ ! -f "$MAP_FILE" ]]; then
  echo "Missing $MAP_FILE. Run scripts/manuscripts/generate-issue-branch-map.sh first."
  exit 1
fi

tail -n +2 "$MAP_FILE" | while IFS=',' read -r issue title branch status; do
  clean_issue="$(echo "$issue" | tr -d '"')"
  clean_title="$(echo "$title" | sed -E 's/^"//; s/"$//')"
  clean_branch="$(echo "$branch" | tr -d '"')"
  echo "gh pr create --base main --head $clean_branch --title \"$clean_title (#$clean_issue)\" --body-file .github/pr-bodies/issue-$clean_issue.md"
done
