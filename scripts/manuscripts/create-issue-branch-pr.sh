#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <issue-number> <slug> [base-branch]"
  exit 1
fi

ISSUE="$1"
SLUG="$2"
BASE_BRANCH="${3:-main}"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

BRANCH="codex/issue-${ISSUE}-${SLUG}"
BODY_FILE=".github/pr-bodies/issue-${ISSUE}.md"

if [[ ! -f "$BODY_FILE" ]]; then
  echo "Missing $BODY_FILE. Run scripts/manuscripts/generate-pr-bodies.sh first."
  exit 1
fi

git fetch origin "$BASE_BRANCH"
git checkout -B "$BRANCH" "origin/$BASE_BRANCH"

echo "Branch prepared: $BRANCH"
echo "Now apply issue-specific changes, then run:"
echo "  git add -A"
echo "  git commit -m 'Issue ${ISSUE} — <title> (#${ISSUE})'"
echo "  git push -u origin $BRANCH"
echo "  gh pr create --base $BASE_BRANCH --head $BRANCH --title 'Issue ${ISSUE} — <title> (#${ISSUE})' --body-file $BODY_FILE"
