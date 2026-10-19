# Quickstart

> **Intended use:** the setup runbook — get the app running locally, then to preview and production. Env-var details live in `docs/ENVIRONMENT.md`; this file is the _steps_.

## Prerequisites

- Node `>=24`, pnpm `>=10` (see `package.json` → `engines`).
- [Supabase CLI](https://supabase.com/docs/guides/local-development) (Docker) for the local database.
- [Vercel CLI](https://vercel.com/docs/cli) for preview/prod deploys.

## 1. Local

```bash
pnpm install
pnpm setup:agentic          # provision agent skills (see scripts/setup-skills.ts)
cp .env.example .env.local  # then fill in values — see docs/ENVIRONMENT.md
pnpm db:start               # local Supabase stack
pnpm db:migrate             # apply migrations
pnpm dev                    # http://localhost:3000
```

The local `POSTGRES_URL` defaults to the Supabase stack (`…@127.0.0.1:54322`). No cloud project needed for local dev.

## 2. Preview

Link the project to Vercel and the Supabase integration once; thereafter:

```bash
vercel deploy
```

The Vercel↔Supabase integration injects `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` — do not set them by hand. Run migrations against the preview DB using the non-pooling URL.

## 3. Production

```bash
vercel deploy --prod
```

Confirm env vars are set in the Vercel dashboard (see `docs/ENVIRONMENT.md`), migrations are applied, and security advisors are clean before promoting.
