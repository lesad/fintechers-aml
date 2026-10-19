# `src/core/db` — database layer (Drizzle + Supabase)

**Server-only.** Everything here imports `server-only`; never import from a Client Component.

## Files

- `client.ts` — the Drizzle client over the **pooled** `POSTGRES_URL` (`prepare: false`, transaction-mode). Import `{ db }` from `@/db`.
- `schema/` — table definitions (the shared data model). Add tables as sibling files and re-export from `schema/index.ts` (`export * from "./users"`); `index.ts` forwards them to the `@/db` barrel via `export *`. Ships as a placeholder.
- `client.spec.ts` — integration smoke test proving the harness (env, `server-only` stub, pool, DB) is wired.

Data-access **query functions live in their feature** (`src/features/<name>/queries.ts`), importing `{ db }` and tables from `@/db` — not here. `core/db` is just the client + the shared schema/model (ADR-0011).

## Schema-change workflow (never `drizzle-kit push`)

1. Add/edit a table in `src/core/db/schema/*.ts`; re-export it from `schema/index.ts`.
2. `pnpm db:gen` → generates SQL in `supabase/migrations/`.
3. **Review the SQL. A rename emits `DROP`+`ADD`** — hand-edit to `RENAME COLUMN`.
4. Every tenant-scoped table needs a companion `NNNN_rls_<name>.sql` RLS migration.
5. `pnpm db:reset` (replay migrations) → `pnpm db:types` (regen `src/core/db/supabase-types.ts`).
6. Commit schema + migration(s) + types together.

Pooled vs direct: the app runtime uses pooled `POSTGRES_URL`; migrations use `POSTGRES_URL_NON_POOLING` (falls back to `POSTGRES_URL`). See `docs/ENVIRONMENT.md`.
