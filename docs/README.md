# docs/ — documentation & agent memory

> **Intended use:** the project's **external memory** and the map to it. A fresh agent (or human) reads this file first, then follows the Agent loop below. Keep it current as the doc set grows.

This directory is durable, committed project memory. Live, in-flight work lives in **dex**, not here.

## Map

| File             | What                                                                                       | Who writes                   |
| ---------------- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| `ROADMAP.md`     | Phased plan / milestones                                                                   | humans + agents              |
| `CHANGELOG.md`   | Release history (Keep a Changelog)                                                         | agents, per change           |
| `DECISIONS.md`   | Architecture decision records (ADRs)                                                       | whoever makes the call       |
| `STACK.md`       | Pinned stack versions + context7 doc IDs                                                   | agents, on dependency change |
| `QUICKSTART.md`  | Local / preview / production setup runbook                                                 | humans                       |
| `FORKING.md`     | One-time "make it yours" checklist for a new fork                                          | humans (new forks)           |
| `ENVIRONMENT.md` | Env-var manifest + secure-handling guide                                                   | humans + agents              |
| `challenge/`     | Hackathon challenge context (FINREG AML triage): start at `challenge/README.md`            | copied from the context repo |
| `UPSTREAM.md`    | Generic changes to contribute back — **consuming forks only**; empty in this template repo | agents + humans (forks)      |
| _(live tasks)_   | tracked in **dex** (`.dex/`), not a file here                                              | agents                       |

## Memory model

Two layers, on purpose:

- **dex** = _live, ephemeral_ work — tasks, subtasks, progress, next steps, cross-session handoff context. JSONL in `.dex/`. Use `dex` (global binary, on PATH). **Never put dex task IDs in commits/PRs/docs** — they're meaningless once done; describe the work instead.
- **committed docs** = _durable_ record — decisions (`DECISIONS.md`), releases (`CHANGELOG.md`), plan shape (`ROADMAP.md`), stack (`STACK.md`).

Canonical specs belong committed under `docs/`; working drafts stay out of git (see ADR-0004).

## Agent loop

A fresh agent (new session / cold start) does:

1. Read `CLAUDE.md`, this file, and `docs/STACK.md`.
2. `dex list --ready` → pick the next unblocked task; `dex show <id>` for context.
3. Do the work under the repo conventions (see `CLAUDE.md`).
4. Verify: `pnpm check` (typecheck + lint + format:check + unit) before claiming done.
5. Record: `dex complete <id> --result "…"`; append to `CHANGELOG.md`; add an ADR to `DECISIONS.md` if a real decision was made; if the change is generic (not app-specific), log it in `UPSTREAM.md`.

The **Documentation discipline** section in `CLAUDE.md` states when each doc must be updated.
