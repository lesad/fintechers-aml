# AML Spotter

AML transaction monitoring that a compliance team can defend to a regulator. Rules find the alerts, code triages and routes them, AI explains them and proposes rule changes, and a person decides.

MoroSystems entry for The FinTechers Hackathon 2026, Track 5 (Compliance and RegTech copilots), FINREG PARTNERS challenge: AML transaction monitoring, triage and red-flag escalation.

## The problem

A bank's monitoring rules raise far more alerts than analysts can read, and most of them are false positives. On the challenge data (July 2026, 5,493 clients, 397,853 transactions) the three seed rules raise 6,682 alerts. Each one needs a priority, a route to the right person, a written justification and an audit trail that holds up in a ČNB inspection. When analysts keep closing the same false positives, the fix belongs in the rules, and a rule change needs evidence and a second pair of eyes.

## What AML Spotter does

- **Detects.** A Kotlin rules engine runs configurable rules (A: activity out of line with the client's profile, B: PEP or high-risk country, C: money in and out again within hours) over the data and stores every hit with its evidence. Rules are versioned CEL conditions in three layers: company, segment and client.
- **Triages in code.** Every alert gets a disposition (auto-close, review low, medium or high, escalate) and a 0 to 100 score from a pure, versioned scorecard with hard floors: a PEP alert never closes on its own. On the first run of the July data: 37 escalate, 672 high, 1,849 medium, 3,825 low, 299 auto-close.
- **Routes and records.** Escalated cases go to the compliance officer, the rest to an analyst. Every decision needs a reason and lands in the case's decision log with who and when.
- **Explains with AI.** The AI Rating (Claude on AWS Bedrock, Frankfurt) reads an alert and returns a rating, a verdict, a summary and the open questions to ask the client. Code checks every reply and stores it with the model, prompt hash and input hash.
- **Turns false positives into rule changes.** When an analyst closes a false positive, the model proposes a rule change from the analyst's reason. Code compiles the condition, simulates it on the run and counts which hits it stops and which alerts it closes. It declines a change that would close a high or escalated alert, or one that stops fewer than two hits.
- **Backtests before anything runs.** A draft rule replays the whole period and shows which cases it would add, drop or re-rate, including cleared false positives and reported cases it would miss.
- **Four eyes on every change.** A rule version or a triage score change is a draft until a second compliance officer approves it. The author can never approve their own change.
- **Audit-ready output.** The FINREG alert CSV (`GET /api/alerts/export.csv`), a rules export as of any moment, and a per-case audit trail as a PDF for a ČNB or FAÚ inspection.

## Where AI does the work, and where it may not

Models judge and write; they never count, compute or decide (ADR-0032, ADR-0034). Triage, priority and routing are code. Code computes every number a model may quote and validates every model output, and a person accepts every rule change before a compliance officer approves it. Details: [`docs/challenge/decision-architecture.md`](docs/challenge/decision-architecture.md), [`docs/rules/README.md`](docs/rules/README.md).

## Architecture

```
data/raw/ (ČNB CSVs, FX fixings)
        │  import
        ▼
Kotlin + Spring Boot engine (engine/) ── Postgres 17 (Docker)
   rules (CEL) → hits → alerts → triage → routing → decision log
        │                         ▲
        │ REST /api               │ AI Rating, rule suggestions, rule explanations
        ▼                         │
React SPA (frontend/)        AWS Bedrock, eu-central-1
   review queue, case detail, settings, backtests, import
```

Everything runs locally; nothing is deployed (ADR-0023). The API is documented in [`engine/README.md`](engine/README.md).

## Run it

Prerequisites: Docker, a JDK 17+ (Gradle downloads JDK 25), Node 24 with pnpm 10, and AWS SSO access to the team account for the data and the model calls.

```bash
# 1. Data (git-ignored; never commit the organisers' data)
aws sso login --profile hackathon
cd frontend && pnpm install && AWS_PROFILE=hackathon pnpm data:pull && cd ..

# 2. Engine: database, import, rules run, then the API on :8080
docker compose -f engine/compose.yaml up -d --wait
cd engine
./gradlew bootRun --args=import
./gradlew bootRun --args=run
AWS_PROFILE=hackathon ./gradlew bootRun

# 3. In a second terminal: the web app on http://localhost:5173 (proxies /api to the engine)
cd frontend && pnpm dev
```

AWS profile setup: [`docs/challenge/aws-participant-guide.md`](docs/challenge/aws-participant-guide.md). The demo walkthrough: [`docs/challenge/demo-script.md`](docs/challenge/demo-script.md).

## Built during the hackathon

Before the event, this repo held only a generic Next.js app template (`agentic-next-app`): framework setup, tooling and an example feature, with no AML or domain code. That state is the `hackathon-start` tag. Everything after it was built during the hackathon, including the Kotlin engine and the move off Next.js to a plain Vite + React SPA (ADR-0025). The team built it with AI coding assistants (Claude Code), as the rules allow and ask us to disclose.

Team: Adrian Lestinsky, Andrej Culen, Jan Bartl, Martin Dulak (MoroSystems).

## Repository map

| Path | What |
| --- | --- |
| `engine/` | Kotlin + Spring Boot rules engine, triage, API, Bedrock calls, Liquibase migrations |
| `frontend/` | Vite + React 19 SPA: review queue, case detail, settings, backtests, import |
| `docs/challenge/` | The challenge, data findings, decision design, demo script |
| `docs/rules/` | Alert types A, B, C, the priority scorecard and the escalation matrix |
| `docs/DECISIONS.md` | Architecture decision records |
| `docs/CHANGELOG.md` | What changed, feature by feature |
| `reference/` | Reference data we own (high-risk countries for rule B) |

## Development

Run `pnpm` commands from `frontend/`, Gradle from `engine/`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server, `/api` proxied to the engine (`ENGINE_URL` overrides) |
| `pnpm check` | typecheck, lint, format check and unit tests |
| `pnpm build` | Production build to `dist/` |
| `pnpm check:fallow` | Dead code, duplication and complexity |
| `./gradlew test` | Engine tests on a throwaway Postgres (Testcontainers) |
| `./gradlew build` | Compile, test and package the engine |

Frontend stack: TypeScript strict, React 19 with the React Compiler, Tailwind v4, own components, zod at the API boundary, Vitest, Oxlint and Oxfmt, Fallow. Versions are in [`docs/STACK.md`](docs/STACK.md).

CI (`.github/workflows/ci.yml`) runs `check`, `build`, `engine` and `fallow` on every push to `main` and on pull requests.
