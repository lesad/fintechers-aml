# Monitoring rules engine

Kotlin + Spring Boot service that imports the organisers' data, runs the monitoring rules and serves alerts over HTTP. A command (`import`, `run`) runs and exits; without one the engine serves the API. Design: [`docs/engine/rules-engine-design.md`](../docs/engine/rules-engine-design.md).

## Prerequisites

- **Docker**, for the local Postgres and for the tests (Testcontainers).
- **Any JDK 17+** to start Gradle. The build itself runs on JDK 25, which the Gradle toolchain downloads on first use.
- **The data** in `data/raw/`: sign in with `aws sso login --profile hackathon`, then `bash scripts/pull-data.sh --profile hackathon` from the repo root (or `pnpm data:pull` inside `frontend/`; setup in the root [README](../README.md#getting-started-for-the-hackathon)). Use your own profile name if it differs.

## Run it locally

From the repo root:

```sh
docker compose -f engine/compose.yaml up -d --wait   # Postgres 17 on 127.0.0.1:5440
cd engine
./gradlew bootRun --args=import                       # ~15 s; migrates the schema, then loads data/raw/
```

The import prints a report. On the July 2026 data it reads:

```
ImportReport(clients=5493, transactions=397853, fxRates=6030, listCodes=31, clientsWithoutQ2=1, negativeVolumes=0, emptyRequiredFields=0)
```

It replaces the data on every run, so running it again is safe. It fails, and leaves the previous data in place, on a currency without a ČNB fixing, a transaction for an unknown client, or a duplicate ID.

Look at the result with `docker exec -it fintechers-aml-db-1 psql -U postgres` (tables `client`, `transaction`, `fx_rate`, `reference_list`; amounts are in haléře, CZK × 100).

Port 5440 avoids other projects' Postgres on 5432. To change it, set `ENGINE_DB_PORT` for compose and `ENGINE_DB_URL` (e.g. `jdbc:postgresql://127.0.0.1:5441/postgres`) for the engine; `ENGINE_DB_USER` and `ENGINE_DB_PASSWORD` default to `postgres`.

Stop the database with `docker compose -f engine/compose.yaml stop`; add `down -v` instead to delete its data.

## Commands

Run from `engine/`:

```sh
./gradlew bootRun --args=import   # load data/raw/ into Postgres
./gradlew bootRun --args=run      # run the rules into hits, alerts and data/out/alerts-<run>.csv
./gradlew bootRun --args=triage   # re-triage the latest run; add a run id to pick one
./gradlew test                    # tests use a throwaway Postgres container, never the dev database
./gradlew build                   # compile, test, package (what CI runs)
```

`./gradlew bootRun --args=run` runs every active rule over July 2026 (~30 s on the full data), stores hits and alerts, and writes `data/out/alerts-<run>.csv`. On the July data: A 5,493 alerts, B 112 (22 PEP clients), C 1,077 (remittances count as outflow, per `docs/rules/C-flow-through.md`; 720 without them).

## HTTP API

```sh
./gradlew bootRun                                     # serves on http://localhost:8080; set ENGINE_PORT to change it
```

- `GET /api/alerts`: alerts of the latest finished run, with the hit count. `?runId=` picks another run.
- `GET /api/alerts/{id}`: one alert. 404 for an unknown id.
- `POST /api/alerts/{id}/summary`: asks Bedrock for a two-to-three sentence summary of the alert's activity, checks it and stores it. 502 when the model fails or its output does not pass the checks; nothing is stored then.
- `GET /api/alerts/{id}/summary`: the latest stored summary, 404 when there is none yet.
- `GET /api/transactions`: the review queue, one row per transaction the latest finished run alerted on and triage did not close on its own (alert types, rules that fired with their key and name, rating, disposition, score, when flagged). Paged with `?page=` (from 0) and `?size=` (1–200, default 50); filtered with `?q=` (transaction or client id, case-insensitive) and `?rating=High|Medium|Low`. The response carries `total` (matching rows) and `countsByRating` (the whole queue, unfiltered). Order: disposition (most severe first), then score, then id.
- `GET /api/transactions/{id}`: one transaction with its client, its alerts in the latest run with each hit's rule name and evidence and its triage (disposition, score, reasons, config version), the transaction's most severe disposition and rating (null when not flagged), and all of the client's transactions, newest first, each with its alert types. 404 for an unknown id.

Amounts in the transaction API are in haléře (`amountHalere`), as stored. A transaction's disposition is the most severe of its alerts' triage dispositions (see Triage below); the three-level rating the UI shows maps `ESCALATE` and `REVIEW_HIGH` to High, `REVIEW_MEDIUM` to Medium, and `REVIEW_LOW` and `AUTO_CLOSE` to Low. `AUTO_CLOSE` transactions stay out of the queue but keep their detail.

The summary needs Bedrock credentials: `aws sso login --profile hackathon`, then start the engine with `AWS_PROFILE=hackathon`. `AlertActivity` collects what each step stored about the alert: the rule hits, aggregated per rule in code (`rule:<key>`: hit count, grain keys, each evidence field as its value or its min and max), and the triage decision and its scoring reasons from `alert_triage` (`triage:decision`, `triage:<code>`); a new step adds its query there. The model decides nothing and computes nothing: code rejects a sentence with a number that is not in the input, either as is or as haléře shown in CZK. The model answers through a fixed JSON schema (Bedrock structured outputs), every sentence lists the refs it rests on, and code rejects a summary that cites nothing, cites a ref outside the alert's activity, or writes a number the input does not hold. Each stored summary keeps the model id and a hash of the prompt. The prompt is `src/main/resources/prompts/alert-summary.md`.

## Triage

Every alert gets a disposition — `AUTO_CLOSE`, `REVIEW_LOW`, `REVIEW_MEDIUM`, `REVIEW_HIGH`, `ESCALATE` — decided in code, with no model (ADR-0033). `--args=run` triages as part of the run; `--args=triage [runId]` re-decides a stored run after a config change, overwriting its rows. On run 1 of the July data:

```
AUTO_CLOSE 299 · REVIEW_LOW 3825 · REVIEW_MEDIUM 1849 · REVIEW_HIGH 672 · ESCALATE 37
```

`Triage.decide(input, config)` is a pure function: no clock, no connection, no randomness. Six steps in a fixed order — base score per rule key, risk factors, score to band, the auto-close gate, the missing-data floor, the hard floors. A floor is applied with `maxOf` over the enum, so it can only make an outcome **stricter**, never milder. `asOf` (the run period's end) and every amount arrive on the input; amounts stay `Long` haléře and `CanonicalJson` throws if a float ever reaches the input hash.

Each decision stores its reasons, `config_version` and a SHA-256 `input_hash` in `alert_triage`, so any past decision can be reconstructed and re-checked. Re-triaging is idempotent: the same input gives the same hash and the same row.

Tuning lives in `src/main/resources/triage/triage-config-v1.json`, validated on load — weights, bands, the auto-close whitelist, the required fields and the floors. **Change a number and you must bump the file and its `configVersion`**, so decisions already taken stay explicable under the config that made them.

### What it reads from the client

Triage scores the client record, not just the alert: rating, PEP, residence, onboarding channel and relationship length come straight off `client`. On top of them sits one check the rule evidence cannot answer, because a hit records `day_volume` but never what the client declared:

- **`CLIENT_UNBASELINED`** — `expected_monthly_volume`, `q2_volume`, `q2_tx_count` or `q2_days` zero or absent. Such a client cannot be profiled at all, so this is an *absence* of evidence, not a red flag: it scores points **and** carries a floor that makes an auto-close impossible. It fires on exactly one client in the July data, K005492, which `data-patterns.md` independently says "has no Q2 activity and should not enter the branch at all".

The rest of the client table is read but **not scored**, deliberately. A ratio of the amount to `expected_monthly_volume` looks like the obvious profile check and is not one here: the generator draws `amount = exp_vol/exp_cnt × exp(N(0,1))`, so the ratio is substantially a proxy for the client's declared transaction *count* (measured r = −0.563, R² = 0.317 against `expected_count`). It would rank clients by how few transactions they declared rather than by how far they deviated, so it is not implemented. The sound form is the per-transaction `z = ln(amount / (exp_vol/exp_cnt))` of rule F, which would need `StrictMath.log` to stay bit-reproducible. Legal type is likewise unscored: no weight is derivable from this data, and type moves behaviour only through declared size, which the amount factor already counts.

`highRiskCountries` is the one key the config ships empty: it is injected at runtime from `reference_list` (`list = 'high_risk'`), so the database stays the single source. On the July data it matches nothing — the list and the countries in the data do not intersect — so the country factor scores zero on every row and rule `B1` never fires.

Three calibration decisions the July data forced, worth re-reading before trusting the numbers:

- **Rule A carries no signal by itself** — it fires for 5,493 of 5,493 clients. Only its intensity (4 to 88 hits, median 43) separates clients, so `intensityBands` scores hit counts per alert type; a raw hit count is not comparable across types.
- **A1/A2/A3 are on the auto-close whitelist.** That is the judgement call in this config: it lets a low-scoring profile-discrepancy alert close without a person. Empty the whitelist and those 299 become `REVIEW_LOW`.
- **PEP is not scored twice.** All 112 type B alerts are PEP clients because rule `B2` requires PEP; `pepImpliedByRules` suppresses the PEP factor when every rule on the alert already implies it.

Schema changes are Liquibase SQL files in `src/main/resources/db/migrations/`, listed in `db/changelog-master.xml`.

Rule CEL declares every field as a qualified name (`tx.amount`, `client.pep`, `p.min_inflow`) with a concrete type; the vocabulary is in `src/main/kotlin/.../cel/Vocabulary.kt`.

Variable filters are compiled to SQL with [cel2sql4j](https://github.com/SPANDigital/cel2sql4j) (`sql/Cel2SqlFilterCompiler.kt`). It does not accept qualified identifiers or dotted column aliases, so the filter sees `tx` as a map and earlier variables by bare column name; `RuleCompiler` type-checks the same filter against the full vocabulary.
