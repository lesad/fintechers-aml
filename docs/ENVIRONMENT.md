# Environment & secrets

> **Intended use:** the single reference for which environment variables the recommended setup needs, which are public vs secret, where each comes from, and how to handle them safely. `.env.example` is the copy-me template; `src/core/env` is the typed/validated schema (via `@t3-oss/env-nextjs`) — this file explains them. **No real secret values ever live in this doc or in git.**

## Required-vars manifest

| Variable                        | Required | Scope               | Source                                                         | Purpose                                                                     |
| ------------------------------- | -------- | ------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes      | **public** (client) | Supabase project settings / `supabase status`                  | Supabase API URL for the browser client                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes      | **public** (client) | Supabase project API keys                                      | Anon key — safe to ship to the browser; RLS enforces access                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes      | **secret** (server) | Supabase project API keys                                      | Full-access key — **server only, bypasses RLS**. Never expose to the client |
| `POSTGRES_URL`                  | yes      | **secret** (server) | Vercel↔Supabase integration (auto) / `supabase status` (local) | Pooled (transaction-mode) connection for the app runtime                    |
| `POSTGRES_URL_NON_POOLING`      | no¹      | **secret** (server) | Vercel↔Supabase integration (auto)                             | Direct connection for DDL/migrations; falls back to `POSTGRES_URL`          |
| `SUPABASE_PROJECT_REF`          | no       | **secret** (dev)    | Supabase dashboard                                             | Supabase MCP target (remote project) — local dev/agent only                 |
| `SUPABASE_ACCESS_TOKEN`         | no       | **secret** (dev)    | Supabase account tokens                                        | Supabase MCP auth — local dev/agent only                                    |
| `SKIP_ENV_VALIDATION`           | no       | build               | —                                                              | Set `true` to skip `env.ts` validation (e.g. Docker build without env)      |
| `STRIP_TEST_IDS`                | no       | build               | —                                                              | Set `1` to strip `data-testid` from the build. Only where e2e never runs    |

¹ Optional at runtime, but **required for migrations** in a managed (preview/prod) environment. The Vercel↔Supabase integration injects it automatically.

## Secure handling

- **Never commit `.env*`** — only `.env.example` (template, empty values) is committed; `.env.local` and friends are gitignored. Confirm with `git check-ignore .env.local`.
- **Least privilege by scope:**
  - `NEXT_PUBLIC_*` are the _only_ vars sent to the browser — never prefix a secret with `NEXT_PUBLIC_`.
  - The **anon key** is client-safe (RLS is the guard). The **service-role key** and the **Postgres URLs** are server-only — they must never reach client bundles (`src/core/db/*` and `src/core/supabase/server.ts` carry an `import "server-only"` guard).
  - Scope the Supabase **access token** to the minimum and treat it like a password.
- **Managed environments (Vercel):** the Supabase integration injects `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` — do **not** set them by hand in preview/prod. Set the `NEXT_PUBLIC_*` + `SUPABASE_SERVICE_ROLE_KEY` in the Vercel dashboard (`vercel env ls`).
- **Local dev:** copy `.env.example` → `.env.local` and fill from `supabase status`. The Postgres URLs default to the local stack (`…@127.0.0.1:54322`); no cloud project needed.
- **Rotation:** rotate the service-role key and access token if leaked; they are not tied to a deploy.
- **Validation:** `src/core/env` validates presence/shape at boot and is the source of truth for what's required — add new vars there (server vs client) _and_ to `.env.example` in the same change.

## MCP secrets (`.mcp.json`)

`.mcp.json` reads secrets via `${…}` interpolation only (`SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`) — **never hardcode a token** in it. The Vercel MCP uses OAuth (browser auth on first connect), so it needs no token in the file.
