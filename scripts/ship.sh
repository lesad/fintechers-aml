#!/usr/bin/env bash
# Push the current branch, open its PR, arm squash auto-merge and wait for CI.
set -euo pipefail

usage() {
  cat <<EOF
Usage: scripts/ship.sh [--title TITLE] [--body BODY] [--no-watch]

Pushes the current branch, opens a PR against main (or reuses the open one),
arms squash auto-merge and waits for the required checks. GitHub merges the PR
once CI is green and deletes the branch.

  --title TITLE  PR title (default: from the commits, via gh pr create --fill)
  --body BODY    PR body: what changed and how it was verified
  --no-watch     return after arming auto-merge instead of waiting for CI
  -h, --help     show this help

On a red check it prints the failing log and exits 1. Fix, commit and run it
again: auto-merge stays armed across pushes.
EOF
}

TITLE=""
BODY=""
WATCH=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="$2"; shift 2 ;;
    --body) BODY="$2"; shift 2 ;;
    --no-watch) WATCH=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 1 ;;
  esac
done

BRANCH="$(git branch --show-current)"
if [[ -z "$BRANCH" || "$BRANCH" == "main" ]]; then
  echo "ship: run it from a feature branch, not ${BRANCH:-a detached HEAD}" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ship: commit or stash your changes first" >&2
  exit 1
fi

git push -u origin HEAD

if ! gh pr view --json number >/dev/null 2>&1; then
  create=(gh pr create --base main)
  if [[ -n "$TITLE" ]]; then create+=(--title "$TITLE" --body "$BODY"); else create+=(--fill); fi
  "${create[@]}"
fi

gh pr merge --auto --squash
gh pr view --json url --jq .url

[[ "$WATCH" == 1 ]] || exit 0

# Checks take a moment to register after the push.
sleep 10
if gh pr checks --watch --fail-fast --required; then
  echo "ship: checks green, auto-merge will land it"
  exit 0
fi

RUN="$(gh run list --branch "$BRANCH" --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')"
echo "ship: checks failed, failing log of run $RUN follows" >&2
gh run view "$RUN" --log-failed | tail -80 >&2
exit 1
