#!/usr/bin/env bash
set -euo pipefail

# Gate for `git commit` (ADR-0006). Wired as a PreToolUse/Bash hook in
# .claude/settings.json, which also carries `"if": "Bash(git commit *)"`.
#
# That `if` filter is an optimization, not a guarantee: it correctly skips
# simple commands, pipelines and `&&` lists, but fails OPEN on shell compound
# constructs (`for`/`while`/`if` blocks) its parser cannot decompose — a bare
# `for f in a b; do ...; done` would otherwise run the whole gate. So re-check
# the real command here. See ADR-0015.
#
# Stdin carries the PreToolUse payload as JSON. No stdin (manual run from a
# terminal), no jq, or an unreadable payload all mean "run the checks" — the
# fail-safe direction for a gate.

# Matches `git commit` at a command position, tolerating an absolute path and
# global options that take a value (`git -C dir commit`, `git -c k=v commit`).
# Deliberately loose: a false positive costs one redundant check run, a false
# negative lets an ungated commit through.
is_git_commit() {
  printf '%s' "$1" | grep -qE \
    '(^|[;&|(]|[[:space:]](do|then|else)[[:space:]])[[:space:]]*([^[:space:]]*/)?git([[:space:]]+[^[:space:];&|]+){0,4}[[:space:]]+commit([[:space:]]|$)'
}

if [ ! -t 0 ]; then
  cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null || true)
  if [ -n "$cmd" ] && ! is_git_commit "$cmd"; then
    exit 0
  fi
fi

echo "→ typecheck"
pnpm typecheck

echo "→ lint"
pnpm lint

echo "→ format:check"
pnpm format:check

echo "→ vitest (changed only)"
pnpm test:changed

echo "✓ pre-commit pass"
