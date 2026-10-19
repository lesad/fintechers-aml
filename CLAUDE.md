# fintechers-aml — Agent Instructions

## Hackathon context (read first)

This app is the MoroSystems entry for The FinTechers Hackathon 2026, Track 5, FINREG PARTNERS "AML transaction monitoring: triage and red-flag escalation". Code freeze: Tuesday 20 October, 13:30. Only commits after the `hackathon-start` tag are judged.

- Challenge, data, decision design and AWS limits: `docs/challenge/README.md`. Read it before building a feature.
- Data: `pnpm data:pull -- --profile <sso-profile>` fills `data/raw/` (git-ignored). Never commit the organisers' data.
- Reference data we own: `reference/high-risk-countries-2026-07.json` (rule B).
- AWS: Frankfurt (`eu-central-1`) only, SSO sign-in, no IAM users or access keys; running code uses an IAM role. Models: `openai.gpt-oss-120b-1:0` (unthrottled), Claude 4.5 only through `eu.` profiles.
- Deterministic rules and all arithmetic stay in code; the model makes typed decisions only, and code validates every model output.

## Stack

- Next.js 16 (App Router) — Server Components default, Server Actions for mutations
- TypeScript strict, `noUncheckedIndexedAccess` on
- Tailwind v4 (CSS-first via `@theme`)
- shadcn/ui (`src/components/ui/`)
- Supabase local (`supabase start`) + Drizzle ORM
- Vitest (unit + integration projects) + Playwright (e2e)
- Storybook 10
- Oxlint + Oxfmt (NOT ESLint/Prettier)
- Fallow for dead code / duplication / health
- next-intl, zod, react-hook-form, `@t3-oss/env-nextjs`

## Stack versions & docs (context7)

Pinned versions + resolved **context7** IDs live in **`docs/STACK.md`**. When you need library docs, **skip `resolve-library-id`** and call `query-docs` directly with the ID from that table. Never guess versions or APIs — look them up there.

## React Compiler

React Compiler is **enabled** (`reactCompiler: true` in `next.config.ts`). It automatically memoizes components and hooks — no manual intervention needed.

**Do NOT add `useMemo`, `useCallback`, or `memo` manually.** Oxlint will error on these imports. The compiler handles all re-render optimization.

**Skill override — `react-best-practices` / `vercel-react-best-practices`:**
The `rerender-memo`, `rerender-memo-with-default-value`, `rerender-dependencies`, `rerender-split-combined-hooks` rules in those skills describe manual memoization patterns. **Skip them** — the compiler makes them unnecessary and actively confusing for generated code.

**What the compiler does NOT handle (still apply manually):**

- Expensive computations outside render (use module-level cache or `server/cache`)
- Async data fetching patterns (waterfalls, `Promise.all`) — `async-*` skill rules still apply
- Bundle size / dynamic imports — `bundle-*` skill rules still apply
- Rules of React violations — hooks must still follow rules (no conditional calls, etc.)

**Compiler needs correct deps in effects.** Keep `react-hooks/exhaustive-deps` clean — the compiler reads deps arrays and will produce wrong output if they're stale/missing.

**Linting coverage:** oxlint enforces `react-hooks/rules-of-hooks` + `react-hooks/exhaustive-deps` (the Rules-of-React the compiler depends on) plus the `no-restricted-imports` memo-hook ban. oxlint has **no** dedicated React-Compiler _bailout_ rule yet (the one that flags a component the compiler will silently skip), and we don't reintroduce ESLint just for it — revisit if oxc ships one, or if the rule lands in oxlint's `react-hooks` port. (`eslint-plugin-react-compiler` was removed — inert under oxlint, which reimplements rules in Rust rather than loading ESLint plugin packages.)

## Hard Rules

- **Always `pnpm add -E` / `pnpm add -D -E`.** No version ranges (no `^`, no `~`). The repo's `.npmrc` has `save-exact=true` to enforce.
- **Never `drizzle-kit push`.** Only `drizzle-kit generate` + reviewed migration commit.
- **Always run `pnpm check` before claiming work done.**
- **Object shapes are `type`, never `interface`** (oxlint `typescript/consistent-type-definitions`). The only exemptions are `global.ts` (module augmentation can't use a `type` alias) and `src/components/ui/**` (shadcn output). Files in `src/components/**/*.tsx` are **PascalCase**, `ui/**` excepted. The `ui/**` exemption block must stay **last** in `.oxlintrc.json` `overrides` — oxlint applies overrides in order and the later match wins per rule, so an exemption placed before the rule it exempts is silently dead. `.oxlintrc.json` is parsed as JSONC, so `//` comments are legal in it (a `"//"` _key_ is not — oxlint rejects unknown fields).
- **Lint/format = Oxlint + Oxfmt.** Do not add ESLint or Prettier. Oxfmt also **sorts imports** (`.oxfmtrc.json` `sortImports`) — don't hand-order imports; `pnpm format` groups (external → `@/` internal → relative → type) and alphabetizes them.
- **Tests co-located** next to source: `*.test.ts(x)` (unit), `*.spec.ts(x)` (integration), `*.e2e.ts` (Playwright). Stories co-located (`*.stories.tsx`). When a folder's tests crowd out its source (~3+), group them into a `__tests__/` sibling folder — **keep the suffix** (discovery globs and the unit/integration/e2e split are suffix-based, not folder-based; `__tests__/` avoids collision with the `src/core/test/` harness). All-or-nothing per folder — don't mix co-located and `__tests__/` in the same directory.
- **Path aliases:** each `src/core/*` module has a **bare alias** — `@/db`, `@/env`, `@/hooks`, `@/i18n`, `@/test`, `@/utils`, `@/validation` (+ `@/supabase/client`, `@/supabase/server`). `@/features/*` → `src/features/*` for vertical slices — each feature has a client-safe `index.ts` barrel (`@/features/guestbook`), and its **server-only members** (`actions`/`queries`) are imported by direct path (`@/features/guestbook/actions`); see ADR-0011. `@/*` → `src/*` covers `@/app`, `@/components`, `@/proxy`. Aliases live in `tsconfig.json` `paths`; adding a core module = add its alias there. **Never import `@/core/…`** — the bare alias decouples the import from the physical path, so moving a module within `core` doesn't churn importers.
- **`src/` layout:** exactly `app/`, `components/`, `core/`, `features/`, `docs/` (+ `proxy.ts` — Next 16's rename of the `middleware` convention; only auto-discovered at `src/proxy.ts`, and its runtime is always `nodejs`, not configurable. See ADR-0018). `components/` is **purely reusable** UI (shadcn `ui/` + shared); domain code lives in `src/features/<name>/` (its components, zod schema, stories, `actions.ts`, data-access `queries.ts`, co-located tests). `core/db` holds the Drizzle client + the **central schema** (shared relational model); feature queries import `{ db, <table> }` from `@/db`. All shared infrastructure lives in `src/core/`, **one module per concern** — a folder with a deliberate `index.ts` public API (`db/`, `hooks/`, `i18n/`, `supabase/`, `test/` incl. `test/ids/`, `utils/`), or a flat `<name>.ts` when it's a single cohesive file that won't grow (`env.ts`, `validation.ts`). Both import the same way via the module's bare alias.
- **Module boundaries — homogeneous barrels (ADR-0012):** a barrel (`index.ts`) is homogeneous in reach-safety — **all** client-safe/isomorphic (importable anywhere) OR **all** server-only (imported only by server code); never mix the two in a barrel a client can import. Import a `core` module through its **root alias** (`import { cn } from "@/utils"`), not a deep internal path (`@/utils/cn`); `index.ts` names exports explicitly (no `export *` grab-bags across modules). Members that pull server-only or node/test-heavy deps are **direct imports** off the client-safe barrel, and **every server module imports `server-only`** (the build-time enforcement). These are instances of that one rule, not ad-hoc exceptions: `supabase` has **no** root index — `server.ts` is `server-only`, so import `@/supabase/client` or `@/supabase/server` directly. `test` keeps `loc`/`T` in the root barrel but excludes `db.ts` (pulls in `postgres`, which breaks webpack's client bundle if reachable from a barrel a Client Component imports) — import it via the deep alias, `@/test/db`. **`features/` follow the same shape:** each `src/features/<name>/` has a **client-safe `index.ts` barrel** (components, zod schema, type-only re-exports), but its **server-only members** — `actions.ts` and `queries.ts` (both reach `@/db` → postgres) — are excluded from the barrel and imported by direct path (`@/features/guestbook/{actions,queries}`), keeping server code out of any client bundle (ADR-0009/0011).
- **Layering (enforced):** `app → features → components → core`; imports may only point **down**. `core/` imports none of the others; `components/` may not import `app/`/`features/` **nor the data layer** (`@/db`, `@/supabase/server`) — reusable UI stays presentational and data-free (fetch in a route/feature, pass props down); `features/` may not import `app/` or another feature via `@/features/*` (use relative imports within a feature, hoist shared code to `components/`/`core/`). Machine-checked by oxlint `no-restricted-imports` patterns per source zone in `.oxlintrc.json` — a violation fails `pnpm check`. See ADR-0011.
- **DB code is server-only** — `import 'server-only'` guard on `src/core/db/*` and `src/core/supabase/server.ts`.
- **RLS:** every new tenant-scoped table needs a companion `NNNN_rls_<name>.sql` migration alongside the Drizzle-generated one.
- **Every lint suppression / unsafe cast carries a rationale comment on the line directly above it** — never a bare `// oxlint-disable*` or unexplained `as unknown as`. State _why_ the rule can't apply (e.g. TS generic-spread limitation, dynamic-key construction). Convention for now, checked at review; once trusted we tighten the rules. (oxlint `reportUndescribedDirectives` will enforce the "reason required" half natively when released — not in 1.62.)

## Workflow

- DB schema change: edit `src/core/db/schema/*.ts` → `pnpm db:gen` → review SQL (rename = DROP+ADD; fix to `RENAME COLUMN` manually) → `pnpm db:reset` → `pnpm db:types` → commit all together.
- New shadcn component: `pnpm dlx shadcn@latest add <name>` (don't hand-write).
- New feature: create `src/features/<name>/` (components + zod schema + `actions.ts` + `queries.ts` + co-located tests) with a client-safe `index.ts` barrel; the `app/` route imports the barrel for UI and the server-only `actions`/`queries` by direct path, staying thin. Reusable, non-domain UI goes in `src/components/`; new tables go in `src/core/db/schema/`.
- New translation: add key to `messages/en.json`, use `useTranslations` hook.
- Server mutation: prefer Server Action over Route Handler.
- **Turbopack + non-ASCII in params:** Next.js 16 with Turbopack does NOT automatically `decodeURIComponent` dynamic route params. If a `[slug]` can contain percent-encoded non-ASCII characters (accents, non-Latin scripts), call `decodeURIComponent(slug)` before using it in a DB query or comparison — otherwise the lookup silently misses.

## Documentation discipline

Keep `docs/` current _as you work_, not deferred. Before finishing a change, sync what applies:

- Real decision made → new/superseding ADR in `docs/DECISIONS.md` (**never edit an accepted ADR** — supersede + annotate).
- Behavioral change → an entry under `[Unreleased]` in `docs/CHANGELOG.md`.
- Change is **generic** (would help any app on the template) → this only applies in a **consuming fork**, where you'd log it in `docs/UPSTREAM.md`. This repo _is_ the template, so its own `UPSTREAM.md` stays empty.
- Dependency bump → update `docs/STACK.md`.

Read `docs/README.md` first (the memory map). A `Stop` hook nudges when source under `src/`/`scripts/` changed but no `docs/` file did — if none applies, say so briefly.

## Skills

**User-scoped** (`~/.claude/skills/` — generic, apply to all projects):

- `react-best-practices` — React/Next.js patterns (vercel-labs, via `vercel-deploy` pkg)
- `react-view-transitions` — View Transitions API (vercel-labs, via `vercel-deploy` pkg)
- `deploy-to-vercel` — Vercel deploy (vercel-labs, via `vercel-deploy` pkg — bundled at user level)
- `vercel-cli-with-tokens` — token-based Vercel CLI (vercel-labs, via `vercel-deploy` pkg — bundled at user level)
- `anthropics/skills/frontend-design`
- `vercel-labs/agent-skills/web-design-guidelines`

Install generic ones: `pnpm dlx skills add <owner/repo> --skill <name> --agent claude-code -y -g`

**Project-scoped** (`.claude/skills/` — this stack only, run `pnpm setup:agentic`):

- `dcramer/dex/dex` — live task memory (see ADR-0003; `dex-plan` deliberately skipped)
- `vercel-labs/next-skills/next-best-practices` — Next.js App Router patterns
- `wshobson/agents/tailwind-design-system` — Tailwind design system
- `vercel-labs/agent-skills/vercel-react-best-practices` — Vercel React patterns
- `supabase/agent-skills/supabase` — Supabase integration
- `supabase/agent-skills/supabase-postgres-best-practices` — Supabase Postgres
- `shadcn/ui/shadcn` — shadcn/ui component library
- `currents-dev/playwright-best-practices-skill` — Playwright e2e

Install project ones: `pnpm dlx skills add <owner/repo> --skill <name> --agent claude-code -y`

**Authored** (committed in `.agents/skills/`, symlinked into `.claude/skills/` by `pnpm setup:agentic`):

- `storybook` — Storybook-as-living-docs: taxonomy, MDX transclusion of `docs/`, MCP consumption.

## Deployment

- **Platform:** Vercel — project linked to `adriven-development/agentic-next-app`
- Preview deploy: `vercel deploy -y --no-wait --scope adriven-development`
- Production deploy: `vercel deploy --prod -y --no-wait --scope adriven-development`
- Env vars: `vercel env ls --scope adriven-development`
- Never `vercel deploy` without explicit user approval for production.

## MCPs

`.mcp.json` ships: supabase, playwright, shadcn, storybook, fallow, vercel.
Fallow MCP ships in the npm `fallow` package — no Rust/cargo needed.
Context7 is globally installed in user environment — not in `.mcp.json`.
Vercel MCP at `https://mcp.vercel.com` (HTTP, OAuth auth required on first connect).

## Testing

- **Unit tests:** `*.test.ts(x)` co-located. happy-dom env, no DB. `pnpm test`.
- **Integration tests:** `*.spec.ts(x)` co-located. Node env, hits real local Postgres, sequential (`fileParallelism: false`). `pnpm test:integration`. Isolation is handled centrally: `integration-setup.ts` registers a global `beforeEach(resetDb)` that truncates every table in `@/db/schema`. **Specs must not write their own cleanup.** Build rows with a feature's own `__tests__/fixtures.ts` (see `insertGuestbookEntry`) — every column is defaulted, so a test spells out only the values it asserts on. See `src/core/test/README.md` for why this is truncation rather than per-test `BEGIN`/`ROLLBACK`, and ADR-0016.- **E2E:** Playwright `*.e2e.ts` co-located in `src/`. `pnpm test:e2e`.
- **`data-testid` is stripped from builds only when `STRIP_TEST_IDS=1`**, by the `@swc/plugin-react-remove-properties` entry in `experimental.swcPlugins`. Two traps: (1) `compiler.reactRemoveProperties` is webpack-only — Turbopack ignores it silently, which is why the wasm plugin is used instead; (2) the gate is **never** `NODE_ENV` — CI runs e2e against a production build. Verify locally with `STRIP_TEST_IDS=1 pnpm build`. The plugin version is pinned to Next's `swc_core` (16.2.4 → v57 → plugin 12.6.0); bump both together or the build fails. See ADR-0014.
- **Scope role-based lookups to a container.** In dev, an unscoped `getByRole("button", { name: "Next" })` also matches Next's "Open Next.js Dev Tools" button, so the test passes against `pnpm start` and fails against `pnpm dev`. Anchor on the dialog/section (or a `loc()` test-id path) instead of the page.
- **`allowedDevOrigins: ["127.0.0.1"]` in `next.config.ts` is load-bearing for e2e — do not remove.** Playwright targets `http://127.0.0.1:3000`, but the dev server's own origin is `localhost`, so Next classifies `127.0.0.1` as cross-origin and blocks `/_next/webpack-hmr`. Without that socket the Turbopack dev client never boots: the page serves correct SSR HTML but never hydrates, so every interactive test fails while SSR-presence tests still pass. Production (`pnpm start`, what CI uses) has no dev-origin guard, so the breakage is dev-only. Symptom to recognise: `⚠ Blocked cross-origin request to Next.js dev resource` in `.next/dev/logs/next-development.log`.
- **`server-only` in node-env tests:** `src/core/db/*` and `src/core/supabase/server.ts` import `server-only`, which throws under Vitest's node env. The integration project aliases `server-only` → `src/core/test/server-only-stub.ts`. Don't remove.
- **Integration env loading:** `src/core/test/integration-setup.ts` loads `.env.local` via `dotenv`. `@t3-oss/env-nextjs` validation only runs once `POSTGRES_URL` is present.
- **Scripts that touch the DB:** `import "dotenv/config"` only loads `.env`. Use `config({ path: [".env.local", ".env"] })` for any `tsx` script (Next loads `.env.local` automatically; node scripts do not).
- **E2E base URL override:** `PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port> pnpm test:e2e` skips Playwright's `webServer` and targets an externally-managed dev (e.g. `bgproc`). Use this when 3000 is occupied or to keep a warm dev across runs.
- **Integration runs reseed on teardown.** `src/core/test/integration-global.ts` (`globalSetup` on the integration project) shells out to `pnpm db:seed` after the suite, because the global truncating `beforeEach` otherwise leaves the database **empty** for whatever reads it next — a dev server, an e2e run, or a `next build` that prerenders from `generateStaticParams` and exits 0 having prerendered almost nothing. It's a teardown, not a command chained after vitest, so it runs on failure too (the run you most want the DB restored after) and can't mask vitest's exit code. `scripts/seed.ts` applies `supabase/seed.sql` — the same file `supabase db reset` uses. **Keep that seed idempotent** (delete-then-insert the rows it owns); nothing resets in front of it.
- **`loc()` chains from the document root, so it cannot be used inside `filter({ has })`.** `loc(page, T.a.b)` is `getByTestId("a").getByTestId("b")`, while `filter({ has })` resolves its argument _relative to each candidate_ — so the chained form matches nothing, silently, as an empty locator rather than an error. Inside a `filter`/`has`, use the bare leaf id: `page.getByTestId(T.a.b.$id)`.
- **An unguarded `expect.poll` / `toHaveCount` stops at the first passing read**, which can be a transient intermediate state. Gate on a real signal, then take one plain non-retrying read.
- **`pnpm test:storybook`** runs the Storybook vitest project — it's opt-in behind `STORYBOOK_TEST` because `storybookTest` loads Storybook's main config at _config_ time, which made every `vitest` invocation boot Storybook (~2.2s). `pnpm test:all` sets the flag; a bare `--project=storybook` without it won't find the project. See ADR-0017.
- **Local e2e runs at 2 workers, not Playwright's default** — `pnpm dev` compiles per route on first hit and ~5 parallel workers stall navigations past any assertion timeout (1-4 rotating failures per run, each passing in isolation). Don't "fix" it by raising timeouts; that was tried. CI uses `50%` because it runs a compiled `pnpm start`. See ADR-0017.
- **Unit project runs `isolate: true`.** Don't set it back to `false` for speed: a shared module registry makes two files mocking the _same_ module collide (first factory wins for both), which passes locally and fails in CI pointing at the other file.
- **Local DB lifecycle:** `supabase start` → `pnpm db:gen` (after schema edit) → `pnpm db:reset` (apply migrations) → `pnpm db:types`. Integration tests + e2e both expect the local DB up.

## Quality gates

- Pre-commit (Claude PreToolUse hook → `.claude/hooks/pre-commit.sh`, per ADR-0006 — husky dropped): typecheck + lint + format-check + `pnpm test:changed` (unit, changed only). The script re-checks the command from the hook payload and exits 0 for non-commits, because the `if` filter fails open on shell `for`/`while`/`if` blocks (ADR-0015) — keep that guard if you edit the hook.
- `pnpm check` (fast, no DB): typecheck + lint + format-check + unit
- `pnpm check:full` (pre-PR, needs `supabase start`): `check` + integration + e2e
- CI jobs: `check` (unit) + `integration` (Supabase) + `e2e` (Playwright + Supabase) + `build` + `fallow`
