# Quickstart

> **Intended use:** the setup runbook — get the app running locally. Environment handling lives in `docs/ENVIRONMENT.md`; this file is the _steps_. Hackathon-specific setup (AWS SSO, `pnpm data:pull`) is in the root `README.md`.

## Prerequisites

- Node `>=24`, pnpm `>=10` (see `package.json` → `engines`).

That is the whole list. The app is a client-only Vite + React SPA (ADR-0025): no database, no container, no environment file.

## 1. Local

```bash
pnpm install
pnpm setup:agentic          # provision agent skills (see scripts/setup-skills.ts)
pnpm dev                    # http://localhost:5173
```

## 2. Production build

```bash
pnpm build                  # static output in dist/
pnpm preview                # serve dist/ locally to check it
```

## 3. Deployment

Nothing is deployed (ADR-0023). `dist/` is a static bundle any host can serve if that changes.

## Data and rules

Persistence, the monitoring rules and the model calls live in the Kotlin + Spring Boot engine (ADR-0024, `docs/engine/rules-engine-design.md`), which the SPA will talk to over HTTP. The engine is CLI-only for now (import and run commands, see `engine/README.md`); it has no HTTP API yet, and the SPA runs on mock data. This app needs nothing from it to boot.
