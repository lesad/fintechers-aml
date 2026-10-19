#!/usr/bin/env bash
# Code freeze: tag origin/main as the submission and lock main against merges.
set -euo pipefail

REPO="lesad/fintechers-aml"
TAG="hackathon-submit"
RULESET_FILE="$(dirname "$0")/../.github/rulesets/main.json"

usage() {
  cat <<EOF
Usage: scripts/freeze.sh [--undo]

Tags origin/main as ${TAG} and pushes the tag, then locks main: the ruleset
gains an "update" rule and loses the admin bypass, so nothing merges, auto-merge
included.

  --undo      restore the ruleset from .github/rulesets/main.json (the tag stays)
  -h, --help  show this help
EOF
}

UNDO=0
case "${1:-}" in
  "") ;;
  --undo) UNDO=1 ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 1 ;;
esac

ID="$(gh api "repos/${REPO}/rulesets" --jq '.[] | select(.name == "main") | .id')"
if [[ -z "$ID" ]]; then
  echo "freeze: no ruleset named main on ${REPO}" >&2
  exit 1
fi

if [[ "$UNDO" == 1 ]]; then
  gh api -X PUT "repos/${REPO}/rulesets/${ID}" --input "$RULESET_FILE" --jq '"unfrozen: " + ([.rules[].type] | join(","))'
  exit 0
fi

git fetch -q origin main
SHA="$(git rev-parse origin/main)"
if git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null; then
  echo "freeze: tag ${TAG} already exists on origin, leaving it" >&2
else
  git tag -a "$TAG" -m "Code freeze submission" "$SHA"
  git push origin "refs/tags/${TAG}"
fi

jq '.rules += [{ "type": "update" }] | .bypass_actors = []' "$RULESET_FILE" \
  | gh api -X PUT "repos/${REPO}/rulesets/${ID}" --input - --jq '"frozen: " + ([.rules[].type] | join(","))'
echo "freeze: ${TAG} -> ${SHA}"
