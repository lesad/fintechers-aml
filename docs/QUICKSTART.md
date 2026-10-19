# Quickstart

> **Intended use:** the setup runbook — get the app running locally, then to preview and production. Env-var details live in `docs/ENVIRONMENT.md`; this file is the _steps_.

## Prerequisites

- Node `>=24`, pnpm `>=10` (see `package.json` → `engines`).
- Docker or Podman with Compose, for the local Postgres container (`compose.yaml`).
- [Vercel CLI](https://vercel.com/docs/cli) for preview/prod deploys.

## 1. Local

```bash
pnpm install
pnpm setup:agentic          # provision agent skills (see scripts/setup-skills.ts)
cp .env.example .env.local  # then fill in values — see docs/ENVIRONMENT.md
pnpm db:start               # local Postgres 17 container
pnpm db:migrate             # apply migrations
pnpm dev                    # http://localhost:3000
```

The local `POSTGRES_URL` defaults to the `compose.yaml` container (`…@127.0.0.1:5432`). All worktrees share it. No cloud database needed for local dev.

## 2. Preview

Link the project to Vercel once and set `POSTGRES_URL` to the AWS RDS endpoint in its env; thereafter:

```bash
vercel deploy
```

Run `pnpm db:migrate` against the target database before the deploy that needs the new schema. Use `POSTGRES_URL_NON_POOLING` when `POSTGRES_URL` goes through a proxy.

## 3. Production

```bash
vercel deploy --prod
```

Confirm env vars are set in the Vercel dashboard (see `docs/ENVIRONMENT.md`), and migrations are applied before promoting.
