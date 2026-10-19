# Environment & secrets

> **Intended use:** the single reference for which environment variables the recommended setup needs, which are public vs secret, where each comes from, and how to handle them safely. `.env.example` is the copy-me template; `src/core/env` is the typed/validated schema (via `@t3-oss/env-nextjs`) — this file explains them. **No real secret values ever live in this doc or in git.**

## Required-vars manifest

| Variable                   | Required | Scope               | Source                                                         | Purpose                                                                           |
| -------------------------- | -------- | ------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `POSTGRES_URL`             | yes      | **secret** (server) | Vercel project env (AWS RDS endpoint) / `.env.example` (local) | Connection for the app runtime                                                    |
| `POSTGRES_URL_NON_POOLING` | no¹      | **secret** (server) | Vercel project env                                             | Direct connection for DDL/migrations; falls back to `POSTGRES_URL`                |
| `SKIP_ENV_VALIDATION`      | no       | build               | —                                                              | Set `true` to skip `env.ts` validation (e.g. Docker build without env)            |
| `STRIP_TEST_IDS`           | no       | build               | —                                                              | Set `1` to strip `data-testid` from the build. Only where no test selects on them |

¹ Needed only when `POSTGRES_URL` goes through a pooling proxy (for example RDS Proxy). Migrations then use this direct endpoint.

## Secure handling

- **Never commit `.env*`** — only `.env.example` (template, empty values) is committed; `.env.local` and friends are gitignored. Confirm with `git check-ignore .env.local`.
- **Least privilege by scope:**
  - `NEXT_PUBLIC_*` are the _only_ vars sent to the browser — never prefix a secret with `NEXT_PUBLIC_`.
  - The **Postgres URLs** are server-only. They must never reach client bundles (`src/core/db/*` carries an `import "server-only"` guard).
- **Managed environments (Vercel):** set `POSTGRES_URL` (and `POSTGRES_URL_NON_POOLING` if used) to the AWS RDS endpoint in the Vercel dashboard (`vercel env ls`).
- **Local dev:** copy `.env.example` → `.env.local`. The Postgres URL defaults to the local container from `compose.yaml` (`…@127.0.0.1:5432`); no cloud database needed.
- **Rotation:** rotate the database password if leaked and update the Vercel env.
- **Validation:** `src/core/env` validates presence/shape at boot and is the source of truth for what's required — add new vars there (server vs client) _and_ to `.env.example` in the same change.

## MCP secrets (`.mcp.json`)

`.mcp.json` holds no secrets; if a server ever needs one, read it via `${…}` interpolation, **never hardcode a token** in it. The Vercel MCP uses OAuth (browser auth on first connect), so it needs no token in the file.
