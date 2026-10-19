# Environment & secrets

> **Intended use:** the single reference for which environment variables the setup needs, which are public vs secret, and how to handle them safely. **No real secret values ever live in this doc or in git.**

## Required-vars manifest

The frontend itself needs **none**. The Vite SPA is client-only (ADR-0025): the typed `env.ts` schema, `@t3-oss/env-nextjs`, the Postgres URLs and `.env.example` all went with the data layer. The engine reads its database settings from the variables below, all with local defaults (`engine/src/main/resources/application.yaml`, `engine/compose.yaml`).

| Variable             | Required | Scope   | Source          | Purpose                                                              |
| -------------------- | -------- | ------- | --------------- | -------------------------------------------------------------------- |
| `AWS_PROFILE`        | no       | shell   | your SSO config | Used by `pnpm data:pull` (default profile: `hackathon`)              |
| `ENGINE_DB_PORT`     | no       | compose | you             | Host port of the local Postgres (default `5440`)                     |
| `ENGINE_DB_URL`      | no       | engine  | you             | JDBC URL (default `jdbc:postgresql://127.0.0.1:5440/postgres`)       |
| `ENGINE_DB_USER`     | no       | engine  | you             | Database user (default `postgres`)                                   |
| `ENGINE_DB_PASSWORD` | no       | engine  | you             | Database password (default `postgres`, local container only)         |

## Secure handling

- **Never commit `.env*`** — `.env.local` and friends are gitignored. Confirm with `git check-ignore .env.local`.
- **Anything a Vite app reads at build time is public.** Only `VITE_*` variables are exposed to client code, and everything exposed ships in the bundle — so **never put a secret behind a `VITE_` prefix**. If the SPA needs privileged data, the engine fetches it server-side.
- **AWS access is SSO-only** — no IAM users, no access keys (`docs/challenge/aws-participant-guide.md`). `aws sso login --profile hackathon`; sessions last 12 hours.
- **The organisers' data never enters git** — `pnpm data:pull` writes to the gitignored `data/`.

## MCP secrets (`.mcp.json`)

`.mcp.json` holds no secrets; if a server ever needs one, read it via `${…}` interpolation, **never hardcode a token** in it.
