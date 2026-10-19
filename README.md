# FinTechers AML triage

MoroSystems entry for The FinTechers Hackathon 2026, Track 5 (Compliance and RegTech copilots), FINREG PARTNERS challenge: AML transaction monitoring, triage and red-flag escalation.

## Built during the hackathon

Before the event, this repo held only a generic Next.js app template (`agentic-next-app`): framework setup, tooling and an example feature, with no AML or domain code. That state is the `hackathon-start` tag. Everything after it is built during the hackathon.

## Template notes

The sections below come from the template and describe its tooling.

## 30-second start

```bash
pnpm install
cp .env.example .env.local         # then fill in Supabase keys after `supabase status`
pnpm db:start                       # boots local Supabase Docker stack
pnpm db:reset                       # applies migrations + seed
pnpm dev                            # http://localhost:3000
```

Get Supabase keys after `pnpm db:start`:

```bash
supabase status
```

> **Forking this for a new app?** See [`docs/FORKING.md`](docs/FORKING.md) for the one-time "make it yours" steps.

## Stack

| Concern       | Pick                                                          |
| ------------- | ------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router, Server Components default)            |
| Lang          | TypeScript strict, `noUncheckedIndexedAccess`                 |
| Styling       | Tailwind v4 (CSS-first, `@theme`)                             |
| Components    | shadcn/ui                                                     |
| DB            | Supabase local + Drizzle ORM                                  |
| Validation    | zod                                                           |
| Forms         | react-hook-form + `@hookform/resolvers/zod`                   |
| Env           | `@t3-oss/env-nextjs`                                          |
| i18n          | next-intl (single `en` locale; add more on demand)            |
| Lint / format | Oxlint + Oxfmt (no ESLint/Prettier)                           |
| Dead code     | Fallow                                                        |
| Tests         | Vitest (unit + integration) + Playwright (e2e) + Storybook 10 |
| Commit gate   | Claude PreToolUse hook (`.claude/hooks/`, no husky)           |

## Why these picks

- **Oxlint/Oxfmt over ESLint/Prettier** — µs-scale linting, 100% Prettier-compatible formatter, smaller agent surface.
- **Drizzle over Prisma** — pure TypeScript schema, generated SQL is reviewable, no codegen step required.
- **Fallow** — single tool replaces knip + jscpd + complexity tooling; native MCP for agents.
- **Single `en` locale** — keeps agent surface clean on day one. Adding locales is two lines.
- **No demo CRUD** — skeleton only. Project skills generate examples on demand.

## Scripts

| Command                                  | What it does                                   |
| ---------------------------------------- | ---------------------------------------------- |
| `pnpm dev`                               | Next dev server (Turbopack)                    |
| `pnpm build`                             | Production build                               |
| `pnpm check`                             | typecheck + lint + format-check + unit tests   |
| `pnpm check:fast`                        | typecheck + lint + format-check (no tests)     |
| `pnpm test`                              | Vitest unit                                    |
| `pnpm test:integration`                  | Vitest integration (hits local Supabase)       |
| `pnpm test:e2e`                          | Playwright                                     |
| `pnpm storybook`                         | Storybook dev                                  |
| `pnpm db:start` / `db:stop` / `db:reset` | Supabase Docker control                        |
| `pnpm db:gen`                            | Drizzle: schema → SQL migration                |
| `pnpm db:migrate`                        | Apply migrations (CI/prod)                     |
| `pnpm db:types`                          | Regenerate Supabase TS types                   |
| `pnpm check:fallow`                      | Dead code + dupes + health                     |
| `pnpm setup:agentic`                     | Install recommended global skills + Fallow MCP |

## Testing

| Layer       | Tool                     | Where                                                        |
| ----------- | ------------------------ | ------------------------------------------------------------ |
| Unit        | Vitest + happy-dom       | `*.test.ts(x)` co-located                                    |
| Integration | Vitest + node + Postgres | `*.spec.ts(x)` co-located, sequential; resets touched tables |
| E2E         | Playwright               | `*.e2e.ts` co-located in `src/`                              |
| Story       | Storybook 10             | `*.stories.tsx` co-located                                   |

## Database workflow

1. Edit `src/core/db/schema/*.ts`.
2. `pnpm db:gen` → review the generated SQL in `supabase/migrations/`.
3. **Renames appear as DROP+ADD** — fix manually to `RENAME COLUMN` before committing.
4. `pnpm db:reset` (replays migrations against fresh local DB).
5. `pnpm db:types` (regenerates Supabase types).
6. Commit schema + migration + types together.

Never use `drizzle-kit push`.

## Agentic setup

```bash
pnpm setup:agentic
```

Installs (globally) curated skills via `npx skills add`. The Fallow MCP server ships with the `fallow` npm package — no separate install.

`.mcp.json` ships with **Supabase, Playwright, shadcn, Storybook, Fallow, Vercel**. Context7 is assumed globally installed.

## CI

`.github/workflows/ci.yml` runs five jobs on PRs and pushes to `main`:

1. `check` — typecheck / lint / format / unit
2. `integration` — Vitest integration + Supabase Docker
3. `e2e` — Playwright + Supabase Docker
4. `build` — Next.js production build
5. `fallow` — dead code / dupes / health; advisory (`continue-on-error`, `fail-on-issues: false`), posts a sticky PR comment. Uses a signed `fallow` binary (pinned ≥2.77.0).

## Deployment

Host-agnostic. Add a Vercel / Fly / Railway / Docker layer per consumer.
