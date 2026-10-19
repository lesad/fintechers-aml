# FinTechers AML triage

MoroSystems entry for The FinTechers Hackathon 2026, Track 5 (Compliance and RegTech copilots), FINREG PARTNERS challenge: AML transaction monitoring, triage and red-flag escalation.

## Built during the hackathon

Before the event, this repo held only a generic Next.js app template (`agentic-next-app`): framework setup, tooling and an example feature, with no AML or domain code. That state is the `hackathon-start` tag. Everything after it is built during the hackathon — including the move off Next.js to a plain Vite + React SPA (ADR-0025).

## Getting started for the hackathon

1. `cd frontend && pnpm install`. The web app lives in `frontend/`, the rules engine in `engine/`; run every `pnpm` command below from `frontend/`.
2. Set up the team AWS account once with `aws configure sso` (answers in `docs/challenge/aws-participant-guide.md`) and name the profile `hackathon`, with `region = eu-central-1`. Switch to it in your shell: `export AWS_PROFILE=hackathon` (fish: `set -gx AWS_PROFILE hackathon`).
3. Sign in: `aws sso login --profile hackathon` (sessions last 12 hours).
4. `pnpm data:pull` fetches the ČNB AML data, the MostlyRight file and the ČNB FX fixings into `data/raw/` (git-ignored).
5. Load the data into the engine's local Postgres (needs Docker), from the repo root: `docker compose -f engine/compose.yaml up -d --wait`, then `cd engine && ./gradlew bootRun --args=import`. Details and the expected output: [`engine/README.md`](engine/README.md).
6. Read `docs/challenge/README.md` for the challenge, the data findings and the decision design.

## Template notes

The sections below come from the template and describe its tooling.

## 30-second start

```bash
cd frontend
pnpm install
pnpm dev                            # http://localhost:5173
```

No environment file and no database: the app is a client-only SPA. Persistence and the monitoring rules live in the Kotlin engine (ADR-0024).

> **Forking this for a new app?** See [`docs/FORKING.md`](docs/FORKING.md) for the one-time "make it yours" steps.

## Stack

| Concern       | Pick                                                |
| ------------- | --------------------------------------------------- |
| Build         | Vite 8 (client-only SPA, React Compiler on)         |
| Lang          | TypeScript strict, `noUncheckedIndexedAccess`       |
| Styling       | Tailwind v4 (CSS-first, `@theme`)                   |
| Components    | own, Tailwind (`src/components/`)                   |
| Data          | HTTP to the Kotlin rules engine (ADR-0024)          |
| Validation    | zod                                                 |
| Forms         | react-hook-form + `@hookform/resolvers/zod`         |
| Lint / format | Oxlint + Oxfmt (no ESLint/Prettier)                 |
| Dead code     | Fallow                                              |
| Tests         | Vitest (unit)                                       |
| Commit gate   | Claude PreToolUse hook (`.claude/hooks/`, no husky) |

## Why these picks

- **Oxlint/Oxfmt over ESLint/Prettier** — µs-scale linting, 100% Prettier-compatible formatter, smaller agent surface.
- **Vite SPA over Next.js** — the engine owns the data and the rules, so the frontend had no server work left to do (ADR-0025).
- **Fallow** — single tool replaces knip + jscpd + complexity tooling; native MCP for agents.
- **English strings inline** — one locale, no i18n layer to thread through every component.

## Scripts

Run from `frontend/`.

| Command              | What it does                                   |
| -------------------- | ---------------------------------------------- |
| `pnpm dev`           | Vite dev server (HMR)                          |
| `pnpm build`         | Production build to `dist/`                    |
| `pnpm preview`       | Serve the built `dist/` locally                |
| `pnpm check`         | typecheck + lint + format-check + unit tests   |
| `pnpm check:fast`    | typecheck + lint + format-check (no tests)     |
| `pnpm test`          | Vitest unit                                    |
| `pnpm data:pull`     | Sync the organisers' datasets into `data/raw/` |
| `pnpm check:fallow`  | Dead code + dupes + health                     |
| `pnpm setup:agentic` | Install recommended global skills + Fallow MCP |

## Testing

| Layer | Tool               | Where                     |
| ----- | ------------------ | ------------------------- |
| Unit  | Vitest + happy-dom | `*.test.ts(x)` co-located |

Every test is a unit test. The `*.spec.ts(x)` integration project went with the database (ADR-0025).

## Agentic setup

```bash
pnpm setup:agentic
```

Installs (globally) curated skills via `npx skills add`. The Fallow MCP server ships with the `fallow` npm package — no separate install.

`.mcp.json` ships with **Fallow**. Context7 is assumed globally installed.

## CI

`.github/workflows/ci.yml` runs four jobs on PRs and pushes to `main`:

1. `check` — typecheck / lint / format / unit
2. `build` — Vite production build
3. `engine` — Gradle build and tests of the Kotlin engine
4. `fallow` — dead code / dupes / health; advisory (`continue-on-error`, `fail-on-issues: false`), posts a sticky PR comment. Uses a signed `fallow` binary (pinned ≥2.77.0).

## Deployment

Nothing is deployed (ADR-0023) — `pnpm build` produces a static `dist/` that any host can serve if that changes.
