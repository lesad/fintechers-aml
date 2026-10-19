# Architecture: which part does what

**Status: settled by ADR-0024, ADR-0025 and ADR-0027** (proposed in a 2026-10-19 working session, then decided the same day). One item is still open: the HTTP API contract between the browser app and the engine, and who writes it first.

Builds on [decision-architecture.md](decision-architecture.md), which says which decisions code makes and which Jev makes. This file says where each part runs and how the parts talk.

## Direction

All logic lives in the Kotlin engine, including the calls to Jev. The browser app is a thin presentation layer, and that is fine: it keeps the UI stack and the frontend team's speed.

## Components

- **Browser app** (`frontend/`, a client-only Vite + React SPA, ADR-0025). Renders the screens (queue, case view, graph, timeline) and calls the engine's REST API directly; there is no server of its own, so CORS is part of the API contract. No business logic, no database access. Today it runs on mock data (`src/features/review-queue/mock.ts`) because the API does not exist yet.
- **Kotlin + Spring Boot engine** (`engine/`, ADR-0024; all logic, system of record). Today a CLI (`import`, `run`, see `engine/README.md`) with no HTTP endpoint. It owns:
  - loading the ČNB CSVs and FX rates
  - the monitoring rules (A, B, C seeded as company rules; layers company, segment, client per ADR-0027) with their facts
  - code-side triage and escalating clear cases
  - the calls to Jev, over its HTTP API (no Kotlin SDK exists)
  - the rules after each Jev answer: low confidence goes to human review, a PEP alert never closes automatically, priority floors and the range check
  - priority, the escalation matrix and the audit log
  - the database schema (Liquibase SQL migrations)
- **Jev.** Hosted externally. Answers typed questions with probabilities. Its request and answer shape stays fixed, so Laya can replace it later.
- **Bedrock.** Generated text such as the case summary; never decides. Proposed, not yet built: the engine calls it too, so every model call is logged in one place.
- **Database.** Postgres 17 in Docker (`engine/compose.yaml`), owned by the engine.
- **Hosting.** Everything runs locally on a team laptop, for the build and the demo. No deployment (ADR-0023).

## Flow for one alert

1. Every client and transaction goes through the engine's rules first. No other path exists.
2. The engine runs the rules and stores each alert with its facts.
3. The engine settles the clear-cut cases in code. Cases it is sure need escalation go straight to escalation, with no Jev call.
4. For the rest, the engine asks Jev, then applies the rules after Jev and records the answer with the Jev version and probabilities.
5. The analyst works the alert in the UI. The browser app sends their actions to the engine's API, which records them.

## Notes

- In the UI and the pitch, say "suspicious" and "escalate", not "fraudulent" and "forward". This is AML, not fraud.
- The engine is the critical path for the whole demo. The frontend works against mock data until the API contract exists.

## Open

1. The API contract between the browser app and the engine, and who writes it first.
