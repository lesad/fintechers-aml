# Architecture: which part does what

**Status: UNDECIDED.** Proposal from a 2026-10-19 working session. It needs full team agreement (Adrian, Andrej, Jan, Martin) before anyone builds on it. Items marked "guess" were never discussed and are open to change.

Builds on [decision-architecture.md](decision-architecture.md), which says which decisions code makes and which Jev makes. This file says where each part runs and how the parts talk.

> **Updated 2026-10-19 (ADR-0025):** the frontend is no longer Next.js — it is a client-only Vite + React SPA with no server of its own. Read every "Next.js" below as "the browser app", and drop the "its server code calls the Kotlin REST API" step: **the browser calls the engine directly**, so the API contract is the SPA's only data source and CORS is now part of it.

## Direction

All logic lives in the Kotlin backend, including the calls to Jev. Next.js is a thin presentation layer. It will be underused, and that is fine: it keeps the template, the UI stack and the frontend team's speed.

## Components

- **Browser.** Talks only to Next.js.
- **Next.js (presentation).** Renders the screens (queue, case view, graph, timeline). Its server code calls the Kotlin REST API and shapes the responses for each screen. No business logic. Guess: it does not touch the database, only the API.
- **Kotlin backend (all logic, system of record).** A simple REST service that owns:
  - loading the ČNB CSVs and FX rates
  - rules A, B and C with their facts
  - code-side triage and escalating clear cases
  - the calls to Jev, over its HTTP API (no Kotlin SDK exists)
  - the rules after each Jev answer: low confidence goes to human review, a PEP alert never closes automatically, priority floors and the range check
  - priority, the escalation matrix and the audit log
  - the database schema
- **Jev.** Hosted externally. Answers typed questions with probabilities. Its request and answer shape stays fixed, so Laya can replace it later.
- **Bedrock.** Generated text such as the case summary; never decides. Guess: Kotlin calls it too, so every model call is logged in one place.
- **Database.** Owned by Kotlin. Which database is still open.
- **Hosting.** Everything runs locally on a team laptop, for the build and the demo. No deployment.

## Flow for one alert

1. Every client and transaction goes through the Kotlin rules first. No other path exists.
2. Kotlin runs rules A, B and C and stores each alert with its facts.
3. Kotlin settles the clear-cut cases in code. Cases it is sure need escalation go straight to escalation, with no Jev call.
4. For the rest, Kotlin asks Jev, then applies the rules after Jev and records the answer with the Jev version and probabilities.
5. The analyst works the alert in the UI. Next.js sends their actions to the Kotlin API, which records them.

## Notes

- In the UI and the pitch, say "suspicious" and "escalate", not "fraudulent" and "forward". This is AML, not fraud.
- The Kotlin backend becomes the critical path for the whole demo. The frontend can start against mock responses once the API contract exists.

## Open questions for the team

1. The API contract between Next.js and Kotlin, and who writes it first.
2. The Kotlin stack (Spring Boot or Ktor).
3. Which database.
