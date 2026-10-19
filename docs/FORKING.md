# Forking this template

> **Intended use:** you copied this template into a new app. This is the one-time "make it yours" checklist — the steps beyond the plain setup in `docs/QUICKSTART.md`. Do these once, then trim what you no longer need.

This repo is a **template** (copied, not forked with shared history). `docs/UPSTREAM.md` now becomes live for you: log any generic improvement you'd contribute back upstream.

## 1. Rename

- `package.json` → `name`.
- `README.md` title + description.
- Find leftovers: `git grep -n agentic-next-app`.
- Vercel / Supabase project names when you link them.

## 2. Wire your own Supabase

Local dev needs only Docker (`pnpm db:start`). For preview/prod, create a Supabase project and link it through the Vercel↔Supabase integration — it injects `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`. Set `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SERVICE_ROLE_KEY` in Vercel. Full manifest: `docs/ENVIRONMENT.md`.

## 3. First table → migration → RLS → types

Follow `src/core/db/README.md`: add a table in `src/core/db/schema/`, `pnpm db:gen`, review the SQL, add a `NNNN_rls_<name>.sql` migration for any tenant-scoped table, `pnpm db:reset`, `pnpm db:types`. Never `drizzle-kit push`.

## 4. First feature

Reads via Server Components calling `src/core/db` functions; mutations via Server Actions + `react-hook-form` + `zod` (see **ADR-0005** in `docs/DECISIONS.md`). No client query lib. Wire UI test-ids via `src/core/test/ids`.

## 5. Demo slice → your app

The template ships a demo `guestbook` slice (route `/guestbook`) exemplifying every core pattern (see **ADR-0010**). Two ways to use it:

- **Building a similar feature?** Re-point the pattern — copy the slice's shape and replace guestbook specifics with yours. Don't delete; re-aim.
- **Want a clean skeleton?** Run `pnpm eject:examples` to strip the whole slice (add `--clean-self` to also remove the eject machinery), then `pnpm db:reset`. Leaves `src/app/[locale]/page.tsx` as a bare home page to replace.

The app ships the `en` locale only; add locales to `messages/` + the `next-intl` config on demand.

## 6. Agentic setup

`pnpm setup:agentic` installs the curated skills and symlinks the authored ones. `.mcp.json` ships Supabase / Playwright / shadcn / Storybook / Fallow / Vercel. See `CLAUDE.md` → Skills / MCPs.

## 7. Deploy

`docs/QUICKSTART.md` §2–3 (Vercel preview/prod). Confirm env vars, applied migrations, and clean Supabase security advisors before promoting.

## 8. Make the docs yours

- `docs/DECISIONS.md` — ADRs 0001–0009 are your inherited baseline; supersede them (never edit) as you diverge.
- `docs/ROADMAP.md` — seed your own phases.
- `docs/CHANGELOG.md` — start your own history.
- `CLAUDE.md` — tune the conventions to your app.
