#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MAP_FILE="$ROOT_DIR/docs/manuscript-issue-branch-map.csv"
BASE_BRANCH="${1:-main}"

cd "$ROOT_DIR"

if [[ ! -f "$MAP_FILE" ]]; then
  echo "Missing $MAP_FILE"
  exit 1
fi

git fetch origin "$BASE_BRANCH"

tail -n +2 "$MAP_FILE" | while IFS=',' read -r issue title branch status; do
  clean_branch="$(echo "$branch" | tr -d '"')"
  git branch -f "$clean_branch" "origin/$BASE_BRANCH" >/dev/null
  echo "prepared $clean_branch from origin/$BASE_BRANCH"
done

echo "All issue branches prepared."
