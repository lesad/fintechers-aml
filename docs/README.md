# docs/ — documentation & agent memory

> **Intended use:** the project's **external memory** and the map to it. A fresh agent (or human) reads this file first, then follows the Agent loop below. Keep it current as the doc set grows.

This directory is durable, committed project memory. Live, in-flight work lives in the session and in the gitignored `superpowers/` drafts, not here (ADR-0030).

## Map

| File             | What                                                                                                                            | Who writes                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `ROADMAP.md`     | Phased plan / milestones                                                                                                        | humans + agents                           |
| `CHANGELOG.md`   | Release history (Keep a Changelog)                                                                                              | agents, per change                        |
| `DECISIONS.md`   | Architecture decision records (ADRs)                                                                                            | whoever makes the call                    |
| `STACK.md`       | Pinned stack versions + context7 doc IDs                                                                                        | agents, on dependency change              |
| `QUICKSTART.md`  | Local / preview / production setup runbook                                                                                      | humans                                    |
| `ENVIRONMENT.md` | Env-var manifest + secure-handling guide                                                                                        | humans + agents                           |
| `challenge/`     | Hackathon challenge context (FINREG AML triage): start at `challenge/README.md`                                                 | humans + agents, single source (ADR-0023) |
| `rules/`         | Rule specifications we iterate on (detect, facts, gates, Jev questions, policy, priority, routing): start at `rules/README.md`  | humans + agents                           |
| `engine/`        | Design of the Kotlin monitoring rules engine (CEL rules, layers, Z3 checks, alerts): `engine/rules-engine-design.md` (ADR-0024) | humans + agents                           |
| `design/`        | Saved Claude Design screens, the source of truth for the UI: start at `design/README.md`                                        | humans + agents                           |
| `superpowers/`   | Gitignored plan, spec and handoff drafts (ADR-0004)                                                                             | agents                                    |

## Memory model

Two layers, on purpose:

- **live work** = the session, the gitignored `docs/superpowers/` drafts and the commit history. Nothing ephemeral is committed; describe the work in the commit and the changelog instead.
- **committed docs** = _durable_ record — decisions (`DECISIONS.md`), releases (`CHANGELOG.md`), plan shape (`ROADMAP.md`), stack (`STACK.md`).

Canonical specs belong committed under `docs/`; working drafts stay out of git (see ADR-0004).

## Agent loop

A fresh agent (new session / cold start) does:

1. Read `CLAUDE.md`, this file, and `docs/STACK.md`.
2. Read `docs/challenge/README.md` and the spec for the feature at hand (`docs/rules/`, `docs/engine/`, `docs/design/`).
3. Do the work under the repo conventions (see `CLAUDE.md`).
4. Verify: `pnpm check` (typecheck + lint + format:check + unit) before claiming done.
5. Record: append to `CHANGELOG.md`; add an ADR to `DECISIONS.md` if a real decision was made.

The **Documentation discipline** section in `CLAUDE.md` states when each doc must be updated.
