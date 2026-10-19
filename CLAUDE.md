# fintechers-aml — Agent Instructions

## Hackathon context (read first)

This app is the MoroSystems entry for The FinTechers Hackathon 2026, Track 5, FINREG PARTNERS "AML transaction monitoring: triage and red-flag escalation". Code freeze: Tuesday 20 October, 13:30. Only commits after the `hackathon-start` tag are judged.

- Challenge, data, decision design and AWS limits: `docs/challenge/README.md`. Read it before building a feature. Team, timeline, rules and judging: `docs/challenge/hackathon.md`. Questions for the mentors and their answers: `docs/challenge/mentor-questions.md`. This folder is the single source; the team's context repo is frozen (ADR-0023).
- Data: `pnpm data:pull` (uses `AWS_PROFILE`, by convention `hackathon`, or `--profile NAME`) fills `data/raw/` (git-ignored). Never commit the organisers' data.
- Reference data we own: `reference/high-risk-countries-2026-07.json` (rule B).
- AWS: Frankfurt (`eu-central-1`) only, SSO sign-in, no IAM users or access keys. Everything runs locally on the `AWS_PROFILE` SSO credentials; nothing is deployed. Models: `openai.gpt-oss-120b-1:0` (unthrottled), Claude 4.5 only through `eu.` profiles.
- Deterministic rules and all arithmetic stay in code. Triage, priority and routing are code; the model only writes summaries and drafts rule proposals, and code validates every model output (ADR-0032). Terms: `docs/GLOSSARY.md`.

## Stack

- **The frontend lives in `frontend/`** (ADR-0029), next to the Kotlin engine in `engine/`. Every `pnpm` command and every `src/…`, `vite.config.ts`, `tsconfig.json`, `.oxlintrc.json` and `.fallowrc.json` path in this file is relative to `frontend/`; `docs/`, `reference/`, `scripts/`, `.github/` and `.claude/` stay at the repo root.
- **Vite 8 + React 19 — a client-only SPA. There is no server, no router, no database here** (ADR-0025). `index.html` → `src/app/main.tsx` → `src/app/App.tsx`.
- TypeScript strict, `noUncheckedIndexedAccess` on
- Tailwind v4 (CSS-first via `@theme`, through `@tailwindcss/vite`)
- Own UI components on Tailwind (`src/components/`), no component library — no shadcn/ui (ADR-0028); design tokens from `docs/design/` live in `src/app/globals.css`; class variants through `cva` from class-variance-authority (ADR-0031)
- Data comes from the Kotlin + Spring Boot rules engine (ADR-0024) over `fetch`, validated with zod (`src/features/review-queue/api.ts`); no client query lib, no axios. `pnpm dev` proxies `/api` to the engine on `127.0.0.1:8080` (`ENGINE_URL` overrides); run it with `./gradlew bootRun` in `engine/` (`engine/README.md`). The review queue and the transaction detail read `GET /api/transactions` (paged) and `GET /api/transactions/{id}`; decisions still live in the browser.
- Vitest (one unit project, config in `vite.config.ts`)
- Oxlint + Oxfmt (NOT ESLint/Prettier)
- Fallow for dead code / duplication / health
- zod, react-hook-form

Gone with Next.js and not to be reintroduced without an ADR: `next-intl` / `messages/` (UI copy is inline English), Drizzle / `postgres` / `compose.yaml` / `db:*` scripts, `src/core/env.ts`, `src/proxy.ts`, `server-only`, Server Actions and RSC, the `*.spec.ts` integration project, and `STRIP_TEST_IDS`.

## Stack versions & docs (context7)

Pinned versions + resolved **context7** IDs live in **`docs/STACK.md`**. When you need library docs, **skip `resolve-library-id`** and call `query-docs` directly with the ID from that table. Never guess versions or APIs — look them up there.

## React Compiler

React Compiler is **enabled** — wired in `vite.config.ts` as `babel({ presets: [reactCompilerPreset()] })` from `@rolldown/plugin-babel`, because `@vitejs/plugin-react` v6 transforms JSX with oxc and takes no `babel` option. It automatically memoizes components and hooks — no manual intervention needed.

**Do NOT add `useMemo`, `useCallback`, or `memo` manually.** Oxlint will error on these imports. The compiler handles all re-render optimization.

**Skill override — `react-best-practices` / `vercel-react-best-practices`:**
The `rerender-memo`, `rerender-memo-with-default-value`, `rerender-dependencies`, `rerender-split-combined-hooks` rules in those skills describe manual memoization patterns. **Skip them** — the compiler makes them unnecessary and actively confusing for generated code.

**What the compiler does NOT handle (still apply manually):**

- Expensive computations outside render (use a module-level cache)
- Async data fetching patterns (waterfalls, `Promise.all`) — `async-*` skill rules still apply
- Bundle size / dynamic imports — `bundle-*` skill rules still apply
- Rules of React violations — hooks must still follow rules (no conditional calls, etc.)

**Compiler needs correct deps in effects.** Keep `react-hooks/exhaustive-deps` clean — the compiler reads deps arrays and will produce wrong output if they're stale/missing.

**Linting coverage:** oxlint enforces `react-hooks/rules-of-hooks` + `react-hooks/exhaustive-deps` (the Rules-of-React the compiler depends on) plus the `no-restricted-imports` memo-hook ban. oxlint has **no** dedicated React-Compiler _bailout_ rule yet (the one that flags a component the compiler will silently skip), and we don't reintroduce ESLint just for it — revisit if oxc ships one, or if the rule lands in oxlint's `react-hooks` port. (`eslint-plugin-react-compiler` was removed — inert under oxlint, which reimplements rules in Rust rather than loading ESLint plugin packages.)

## Hard Rules

- **Always `pnpm add -E` / `pnpm add -D -E`.** No version ranges (no `^`, no `~`). The repo's `.npmrc` has `save-exact=true` to enforce.
- **Always run `pnpm check` before claiming work done.**
- **Object shapes are `type`, never `interface`** (oxlint `typescript/consistent-type-definitions`). No exemptions. Files in `src/components/**/*.tsx` are **PascalCase**. oxlint applies `.oxlintrc.json` `overrides` in order and the later match wins per rule, so an exemption block must come after the rule it exempts. `.oxlintrc.json` is parsed as JSONC, so `//` comments are legal in it (a `"//"` _key_ is not — oxlint rejects unknown fields).
- **Lint/format = Oxlint + Oxfmt.** Do not add ESLint or Prettier. Oxfmt also **sorts imports** (`.oxfmtrc.json` `sortImports`) — don't hand-order imports; `pnpm format` groups (external → `@/` internal → relative → type) and alphabetizes them.
- **Tests co-located** next to source: `*.test.ts(x)`, all unit. When a folder's tests crowd out its source (~3+), group them into a `__tests__/` sibling folder — **keep the suffix** (discovery globs are suffix-based, not folder-based; `__tests__/` avoids collision with the `src/core/test/` harness). All-or-nothing per folder — don't mix co-located and `__tests__/` in the same directory.
- **Path aliases:** each `src/core/*` module has a **bare alias** — `@/hooks`, `@/utils`, plus deep `@/test/*` (`@/test/ids`, `@/test/render`). `@/features/*` → `src/features/*` for vertical slices, each with an `index.ts` barrel; see ADR-0011. `@/*` → `src/*` covers `@/app` and `@/components`. Aliases live in `tsconfig.json` `paths` and nowhere else — Vite and Vitest both read them from there (`resolve.tsconfigPaths`), so adding a core module = add its alias there. **Never import `@/core/…`** — the bare alias decouples the import from the physical path, so moving a module within `core` doesn't churn importers.
- **`src/` layout:** exactly `app/`, `components/`, `core/`, `features/`. `app/` is the **application shell**, not a router — `main.tsx` (mount), `App.tsx` (the page), `ErrorBoundary.tsx` (the one class component in the codebase), `globals.css`. `components/` is **purely reusable** UI, exported through `components/index.ts`; domain code lives in `src/features/<name>/` (its components, zod schema, data access, co-located tests). All shared infrastructure lives in `src/core/`, **one module per concern** — a folder with a deliberate `index.ts` public API (`hooks/`, `test/` incl. `test/ids/`, `utils/`), or a flat `<name>.ts` when it's a single cohesive file that won't grow. Both import the same way via the module's bare alias.
- **Module boundaries — barrels stay bundle-safe (ADR-0012, as narrowed by ADR-0025):** everything ships to the browser now, so the server/client split is gone — but the rule it protected is not. A barrel (`index.ts`) must not re-export anything that drags test-only or node-only dependencies into the app graph. Import a `core` module through its **root alias** (`import { cn } from "@/utils"`), not a deep internal path (`@/utils/cn`); `index.ts` names exports explicitly (no `export *` grab-bags across modules). `test` has no root barrel — import its members by deep alias (`@/test/ids`, `@/test/render`), because `render.tsx` pulls `@testing-library/react`. **`features/` follow the same shape:** each `src/features/<name>/` has an `index.ts` barrel (components, zod schema, type-only re-exports) with the feature's data access alongside it.
- **Layering (enforced):** `app → features → components → core`; imports may only point **down**. `core/` imports none of the others; `components/` may not import `app/`/`features/` — reusable UI stays presentational and data-free (fetch in the shell or a feature, pass props down); `features/` may not import `app/` or another feature via `@/features/*` (use relative imports within a feature, hoist shared code to `components/`/`core/`). Machine-checked by oxlint `no-restricted-imports` patterns per source zone in `.oxlintrc.json` — a violation fails `pnpm check`. See ADR-0011.
- **Every lint suppression / unsafe cast carries a rationale comment on the line directly above it** — never a bare `// oxlint-disable*` or unexplained `as unknown as`. State _why_ the rule can't apply (e.g. TS generic-spread limitation, dynamic-key construction). Convention for now, checked at review; once trusted we tighten the rules. (oxlint `reportUndescribedDirectives` will enforce the "reason required" half natively when released — not in 1.62.)

## Workflow

- New reusable component: a PascalCase file in `src/components/`, styled with Tailwind and the `@theme` tokens, exported from `src/components/index.ts`. Classes that depend on props or state are a `cva` definition with named variants, not inline ternaries; `cn()` only merges a caller's `className` (ADR-0031).
- New feature: create `src/features/<name>/` (components + zod schema + its `fetch`-based data access + co-located tests) with an `index.ts` barrel; `src/app/App.tsx` imports the barrel and stays thin. Reusable, non-domain UI goes in `src/components/`.
- New UI copy: inline English in the component. There is no message catalog (ADR-0025).
- Data access: `fetch` against the Kotlin engine, validated with zod at the boundary — never trust a response shape. No client query lib, no axios (ADR-0005). Tests stub `fetch` with responses in the engine's shape.

## Documentation discipline

Keep `docs/` current _as you work_, not deferred. Before finishing a change, sync what applies:

- Real decision made → new/superseding ADR in `docs/DECISIONS.md` (**never edit an accepted ADR** — supersede + annotate).
- Behavioral change → an entry under `[Unreleased]` in `docs/CHANGELOG.md`.
- Dependency bump → update `docs/STACK.md`.

Read `docs/README.md` first (the memory map).

## Skills

**User-scoped** (`~/.claude/skills/` — generic, apply to all projects):

- `react-best-practices` — React patterns (vercel-labs, via `vercel-deploy` pkg). Its Next.js-specific rules no longer apply here.
- `react-view-transitions` — View Transitions API (vercel-labs, via `vercel-deploy` pkg)
- `anthropics/skills/frontend-design`
- `vercel-labs/agent-skills/web-design-guidelines`

Install generic ones: `pnpm dlx skills add <owner/repo> --skill <name> --agent claude-code -y -g`

**Project-scoped** (`.claude/skills/` — this stack only, run `pnpm setup:agentic`):

- `wshobson/agents/tailwind-design-system` — Tailwind design system
- `vercel-labs/agent-skills/vercel-react-best-practices` — Vercel React patterns
- `typesafe-ai/skills/typesafe-ai` — TypeSafe System One typed judgments

Install project ones: `pnpm dlx skills add <owner/repo> --skill <name> --agent claude-code -y`

## Deployment

Nothing is deployed (ADR-0023). `pnpm build` emits a static `dist/`; the engine runs locally from `engine/` (`engine/README.md`). There is no Vercel project, no deploy command and no hosted environment.

## MCPs

`.mcp.json` ships: fallow.
Fallow MCP ships in the npm `fallow` package — no Rust/cargo needed.
Context7 is globally installed in user environment — not in `.mcp.json`.

## Testing

- **Unit tests are the only tests:** `*.test.ts(x)` co-located, happy-dom, no I/O. `pnpm test`. Config lives in `vite.config.ts` → `test.projects` (there is no separate `vitest.config.ts`). Render through `@/test/render`, the single seam for app-wide providers.
- **`data-testid` ships in the build.** The SWC strip plugin was Turbopack-specific and went with Next.js (ADR-0025 supersedes ADR-0014). Nothing is deployed to users, so the attributes are harmless; reintroduce a strip step only if that changes.
- **Unit project runs `isolate: true`.** Don't set it back to `false` for speed: a shared module registry makes two files mocking the _same_ module collide (first factory wins for both), which passes locally and fails in CI pointing at the other file.

## Quality gates

- Pre-commit (Claude PreToolUse hook → `.claude/hooks/pre-commit.sh`, per ADR-0006 — husky dropped): typecheck + lint + format-check + `pnpm test:changed` (unit, changed only). The script re-checks the command from the hook payload and exits 0 for non-commits, because the `if` filter fails open on shell `for`/`while`/`if` blocks (ADR-0015) — keep that guard if you edit the hook.
- `pnpm check` (fast, no DB): typecheck + lint + format-check + unit
- CI jobs: `check` (unit) + `build` (Vite) + `engine` (Gradle build and tests) + `fallow`. They run on pushes to `main` and on PRs; none of them gates a push (ADR-0026).

## Shipping (ADR-0026)

Changes go straight to `main`; PRs are optional, not required. CI (`check`, `build`, `engine`, `fallow`) still runs on every push to `main` and on any PR, but it no longer gates the merge.

- Run `pnpm check` locally before pushing. A red `main` is fixed forward right away.
- Commit messages on `main` are Conventional Commits.
- `main` ruleset lives in `.github/rulesets/main.json`. Apply a change with `gh api -X PUT repos/lesad/fintechers-aml/rulesets/<id> --input .github/rulesets/main.json` (`gh api repos/lesad/fintechers-aml/rulesets` lists the id).
- Code freeze (Tuesday 20 October, 13:30): `pnpm freeze` tags `origin/main` as `hackathon-submit` and locks `main` (no pushes, no bypass). `pnpm freeze --undo` restores the ruleset from `main.json`.
