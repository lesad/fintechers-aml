# Forking this template

> **Intended use:** you copied this template into a new app. This is the one-time "make it yours" checklist — the steps beyond the plain setup in `docs/QUICKSTART.md`. Do these once, then trim what you no longer need.

This repo is a **template** (copied, not forked with shared history). `docs/UPSTREAM.md` now becomes live for you: log any generic improvement you'd contribute back upstream.

## 1. Rename

- `package.json` → `name`.
- `README.md` title + description.
- Find leftovers: `git grep -n agentic-next-app`.
- Vercel project name when you link it.

## 2. Wire your own backend

There is none in this repo: the app is a client-only Vite + React SPA and the data lives behind the Kotlin engine (ADR-0024/0025). Point the SPA at your own API over `fetch`. Nothing in `pnpm dev` depends on it being up. Environment handling: `docs/ENVIRONMENT.md` — remember that every `VITE_*` variable ships in the bundle.

## 3. First feature

A feature is a folder under `src/features/<name>/`: components, its zod schema, co-located tests, a client-safe `index.ts` barrel. Data access is a `fetch` wrapper against your API — no client query lib (**ADR-0005** in `docs/DECISIONS.md`, as amended by ADR-0025). Forms via `react-hook-form` + `zod`. Wire UI test-ids via `src/core/test/ids`.

## 4. The app shell

`src/app/` is the shell, not a router: `main.tsx` mounts `App.tsx` inside `ErrorBoundary.tsx`. Replace `App.tsx` with your own first screen, and add a router there if you grow past one page (ADR-0025 deliberately ships without one).

UI copy is inline English — there is no i18n layer. Add one back only if a second locale appears.

## 5. Agentic setup

`pnpm setup:agentic` installs the curated skills. `.mcp.json` ships shadcn / Fallow / Vercel. See `CLAUDE.md` → Skills / MCPs.

## 6. Deploy

`pnpm build` emits a static `dist/`. Nothing is deployed from this repo (ADR-0023); add the host layer you want.

## 7. Make the docs yours

- `docs/DECISIONS.md` — ADRs 0001–0009 are your inherited baseline; supersede them (never edit) as you diverge.
- `docs/ROADMAP.md` — seed your own phases.
- `docs/CHANGELOG.md` — start your own history.
- `CLAUDE.md` — tune the conventions to your app.
