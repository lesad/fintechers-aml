#!/usr/bin/env bash
# Stop hook: soft, one-shot nudge to keep docs/ in sync (see CLAUDE.md → Documentation discipline).
# Session-scoped: looks at files THIS session edited (from the transcript), not the whole dirty working
# tree — so pre-existing uncommitted docs/ edits don't mute it. Fires when source (src|scripts) was
# edited this session but no docs/ file was. Never hard-loops.
set -euo pipefail

input=$(cat)

# One-shot: if we already nudged this stop-cycle, allow the stop.
if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty')
# Fail open: no transcript → don't block.
if [ -z "$transcript" ] || [ ! -f "$transcript" ]; then
  exit 0
fi

# Repo-relative paths of files edited this session via Edit/Write/MultiEdit/NotebookEdit.
edited=$(jq -r '
  select(.type == "assistant")
  | .message.content[]?
  | select(.type == "tool_use" and (.name | test("^(Edit|Write|MultiEdit|NotebookEdit)$")))
  | .input.file_path // empty
' "$transcript" 2>/dev/null | sort -u | sed "s#^${dir}/##")

[ -z "$edited" ] && exit 0

src=$(printf '%s\n' "$edited" | grep -E '^(src|scripts)/' || true)
docs=$(printf '%s\n' "$edited" | grep -E '^docs/' || true)

if [ -n "$src" ] && [ -z "$docs" ]; then
  reason="This session edited source under src/|scripts/ but no docs/ file. Per the Documentation discipline rule (CLAUDE.md), before finishing sync what applies: docs/DECISIONS.md (new/superseding ADR), docs/CHANGELOG.md ([Unreleased]), docs/UPSTREAM.md (generic changes). If none apply to this change, say so briefly and stop."
  jq -cn --arg r "$reason" '{decision: "block", reason: $r}'
fi
exit 0
