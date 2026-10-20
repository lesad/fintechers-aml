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

Look at the result with `docker exec -it fintechers-aml-db-1 psql -U postgres` (tables `client`, `transaction`, `fx_rate`, `reference_list`; amounts are in CZK, as the source CSV delivers them).

Port 5440 avoids other projects' Postgres on 5432. To change it, set `ENGINE_DB_PORT` for compose and `ENGINE_DB_URL` (e.g. `jdbc:postgresql://127.0.0.1:5441/postgres`) for the engine; `ENGINE_DB_USER` and `ENGINE_DB_PASSWORD` default to `postgres`.

Stop the database with `docker compose -f engine/compose.yaml stop`; add `down -v` instead to delete its data.

## Commands

Run from `engine/`:

```sh
./gradlew bootRun --args=import   # load data/raw/ into Postgres
./gradlew bootRun --args=run      # run the rules into hits, alerts and data/out/alerts-<run>.csv
./gradlew bootRun --args=triage   # re-triage the latest run; add a run id to pick one
./gradlew bootRun --args=explain  # write the missing rule explanations with Bedrock (needs AWS_PROFILE after aws sso login)
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
- `POST /api/alerts/{id}/assessment`: asks Bedrock for the AI Rating (what the model makes of the alert: a rating, a verdict, a short summary and up to three open points with whom to ask), checks it and stores it. It returns the `AiResult` envelope with 200 (ADR-0043): `{alertId, kind, status, body, error, modelId, promptHash, inputHash, createdAt}`, where `status` is `ready`, `rejected` (the checks refused the reply; `error` says why) or `failed` (Bedrock or the transport failed). Every result is stored, so a rejected one stays visible.
- `GET /api/alerts/{id}/assessment`: the newest stored result, whatever prompt made it (ADR-0045); 404 when it never ran.
- `POST /api/alerts/{id}/suggestion`: body `{"reason": "..."}`, the reviewer's false-positive reason. Asks Bedrock for a rule change, checks it and returns it: `kind` (`rule_version` or `none`), `explanation`, `rule` (the draft in the shape of the `/api/rules` POST body without `author`, plus its `version`), `previousParams` (the values of the rule it replaces or retires), `retires` `ruleExplanation` (the new rule in plain English, starting with "Flags"; null for `none`), `impact` (hits stopped and added and alerts closed by triage disposition in the alert's run, for the client and, for a company change, for all clients) and `declined` (why code turned a valid draft into `none`). A client-layer change gets the key `<key>-<client id>` and replaces the rule for that client. 400 for a blank reason or one over 2,000 characters, 404 for an unknown alert, 502 when the model fails or its reply does not pass the checks. Nothing is stored.
- `GET /api/transactions`: the review queue, one row per transaction the latest finished run alerted on and triage did not close on its own (alert types, rules that fired with their key and name, rating, disposition, score, case status, when flagged). Paged with `?page=` (from 0) and `?size=` (1–200, default 50); filtered with `?q=` (transaction or client id, case-insensitive), `?rating=High|Medium|Low` and `?status=` (`NEW`, `ESCALATED`, `FALSE_POSITIVE`, `REPORTED`; repeat it or comma-separate for several; a transaction matches on its case status). `?assignee=<user id>` keeps only the cases assigned to that user, in any status (ADR-0042). The response carries `total` (matching rows) and `countsByRating` (the assignee's cases, whatever the other filters; the whole queue without one). Order: reported cases last (they are resolved), then disposition (most severe first), then score, then id.
- `POST /api/imports` (multipart `file`, `X-User-Id`): imports a transactions CSV in the ČNB format (the columns of `data/raw/CNB/transactions.csv`) on top of the stored data, in the background: validate, load the rows, run the rules and triage. A transaction id already stored is overwritten (within a file the last row wins); a row for an unknown client, of an unknown type, in a currency without a ČNB fixing in `fx_rate`, or with an empty required field is rejected and counted. A case a person decided in the run before keeps its status, assignee and decision log in the new run. 202 with the job; 400 without a known user; 409 while another import runs. Up to 200 MB.
- `GET /api/imports`, `GET /api/imports/{id}`: the import history, newest first, and one job to poll (`stage` `VALIDATE` → `IMPORT` → `RUN` → `DONE` or `FAILED`; `status` `COMPLETED`, `PARTIAL` or `FAILED`, null while running; rows imported and rejected; new alerts; `note` with the reason).
- `GET /api/data`, `DELETE /api/data` (`X-User-Id`): how many transactions and alerts there are, and deleting them all with their runs, hits, triage and summaries. Clients, rules, users and the import history stay. 409 while an import runs.
- `GET /api/users`: the people who work the queue (`id`, `name`, `role` `REVIEWER` or `MANAGER`; two seeded by migration 0018). There is no login: the UI picks one and sends its id as `X-User-Id` on every call.
- `PUT /api/transactions/{id}/status` with `{"status": "ESCALATED", "reason": "…"}` and `X-User-Id`: sets the status of the transaction's alerts in the latest finished run (one of `NEW`, `ESCALATED`, `FALSE_POSITIVE`, `REPORTED`), stores the user as `alert.status_by` and logs the decision with its reason in `case_event`. Escalating hands the case to the manager. 204; 400 for another status, a blank reason, or a missing or unknown `X-User-Id`; 404 when the transaction has no alert in that run. Earlier runs keep theirs. A transaction's case status is the most advanced of its alerts' (`NEW` < `FALSE_POSITIVE` < `ESCALATED` < `REPORTED`).
- `PUT /api/transactions/{id}/assignee` with `{"userId": 2}` and `X-User-Id`: hands an open case to that user and logs it as `REASSIGNED`. 204; 400 for an unknown user; 404 when the transaction has no alert in the latest run; 409 for a closed case (`FALSE_POSITIVE`, `REPORTED`). Triage assigns every new case (escalated → manager, others → reviewer); `GET /api/transactions/{id}` returns `assignee` and `log` (newest first).
- `GET /api/transactions/{id}`: one transaction with its client, its alerts in the latest run with each hit's rule name and evidence and its triage (disposition, score, reasons, config version), the transaction's most severe disposition and rating, and its case status (null when not flagged), the client's transactions on that day (`day`, newest first, each with its alert types) and how many the client has in all (`historyCount`). 404 for an unknown id.
- `GET /api/transactions/{id}/history?direction=older|newer&limit=5`: up to `limit` (1–200, default 5) of the client's transactions right before or after transaction `id`, newest first, and `more` when further ones exist. Page on by passing the last id shown. 400 for another direction, 404 for an unknown id.
- `POST /api/rules/{id}/backtest?from=2026-07-01&to=2026-07-31` (`X-User-Id` optional): replays the period (dates, inclusive) with the draft `id` in place of its active version, compares the cases per transaction and stores the result (ADR-0049); both runs are rolled back. It runs in the background, one at a time, and deletes every stored backtest first: 202 at once with the summary, `status: RUNNING`; poll `GET` until `DONE` (`transactions` replayed, `newCount`, `droppedCount`, `changedCount`, `unchangedCount`) or `FAILED` (`error`). 400 when `id` is not a draft or the period is backwards, 404 when there is no version `id`. Two full runs: about 35 s for a week of July.
- `GET /api/rules/{id}/backtest`: the draft's stored backtest summary; 404 when it has none. `GET /api/rules/{id}/backtest/rows?view=all|changed|new|dropped&page=0&size=100`: its rows in the backtest's order, paged and filtered here (`items`, `total`; each with `before`/`after` rating or null, `change` `NEW`/`RAISED`/`LOWERED`/`DROPPED`/`UNCHANGED`, `note`). The tables `backtest` and `backtest_row` are kept apart from runs and alerts; deleting the draft, or its leaving draft and pending (approved, active), deletes its backtest.
- `DELETE /api/rules/{id}`: deletes a draft with its variables and parameters; a key with no other version is gone. 204; 400 when it is not a draft; 404 when there is none.
- `GET /api/rules`: every rule version, by key, newest version first, each with its variables, parameters, status, author and plain-English `explanation` (null until written). Enums are lowercase; a window is `{ "kind": "day" }` or `{ "kind": "relative", "from": "PT-24H", "to": "PT0S" }`.
- `GET /api/rules/{id}`: one rule version. 404 for an unknown id.
- `POST /api/rules`: saves a new `draft` version of `key` (version = the key's highest + 1). The body is the same shape without `id`, `version`, `status`, `createdAt` and the explanation fields. A new version keeps its key's alert type, layer, scope and `replaces`. 400 with the reason in `detail` for a CEL type error or an invalid rule, 409 when another version of the key was saved at the same moment. After storing the draft the engine asks Bedrock (Opus 4.5, `RULES_EXPLANATION_MODEL_ID`) for its explanation; a model failure still returns 201 with `explanation: null`. Drafts do not run.
- `POST /api/rules/explanation`: the same body as a save; checks the rule the same way (400 with the reason) and returns `{ explanation, model }` for how its next version would read, without storing anything. 502 when the model gives no usable explanation.

Amounts in the transaction API are in CZK (`amount`, `expectedMonthly`, `q2Volume`, `q2MaxTx`), as stored. A transaction's disposition is the most severe of its alerts' triage dispositions (see Triage below); the three-level rating the UI shows maps `ESCALATE` and `REVIEW_HIGH` to High, `REVIEW_MEDIUM` to Medium, and `REVIEW_LOW` and `AUTO_CLOSE` to Low. `AUTO_CLOSE` transactions stay out of the queue but keep their detail.

The AI Rating needs Bedrock credentials: `aws sso login --profile hackathon`, then start the engine with `AWS_PROFILE=hackathon`. `AlertActivity` collects what each step stored about the alert: the rule hits, aggregated per rule in code (`rule:<key>`: hit count, grain keys, each evidence field as its value or its min and max), and the triage decision and its scoring reasons from `alert_triage` (`triage:decision`, `triage:<code>`); a new step adds its query there. The model decides nothing and computes nothing: code rejects a sentence with a number that is not in the input; amounts are CZK in the input already, so no conversion is allowed. The model answers through a fixed JSON schema (Bedrock structured outputs), every sentence lists the refs it rests on, and code rejects a claim that cites nothing, cites a ref outside the alert's activity, or writes a number the input does not hold. Each stored result (table `ai_result`) keeps the model id, a hash of the prompt and schema, and a hash of the input. The prompt is `src/main/resources/prompts/alert-assessment.md`; `ai/AiGenerator` is the one call path, and each kind supplies only its prompt, schema and body parser. The assessment also reads `AlertFacts`, which code computes (the client against its Q2 baseline, the counterparties, the money flow, the client's other alerts; ratios as text), and its prompt gets one focus paragraph per triage disposition (`assessment-focus-*.md`). The rating is advice: triage, priority and queue order never read it.

## Triage

Every alert gets a disposition — `AUTO_CLOSE`, `REVIEW_LOW`, `REVIEW_MEDIUM`, `REVIEW_HIGH`, `ESCALATE` — decided in code, with no model (ADR-0033). `--args=run` triages as part of the run; `--args=triage [runId]` re-decides a stored run after a config change, overwriting its rows. On run 1 of the July data:

```
AUTO_CLOSE 299 · REVIEW_LOW 3825 · REVIEW_MEDIUM 1849 · REVIEW_HIGH 672 · ESCALATE 37
```

`Triage.decide(input, config)` is a pure function: no clock, no connection, no randomness. Six steps in a fixed order — base score per rule key, risk factors, score to band, the auto-close gate, the missing-data floor, the hard floors. A floor is applied with `maxOf` over the enum, so it can only make an outcome **stricter**, never milder. `asOf` (the run period's end) and every amount arrive on the input; amounts are CZK `Double`s, which `CanonicalJson` renders through one plain decimal form (`plain`), so `25.0` and `25` hash alike; NaN and the infinities are rejected.

An `ESCALATE` decision also moves the alert from `NEW` to `ESCALATED`, so it lands in the manager's queue; a status a person already set is left alone. Each decision stores its reasons, `config_version` and a SHA-256 `input_hash` in `alert_triage`, so any past decision can be reconstructed and re-checked. Re-triaging is idempotent: the same input gives the same hash and the same row.

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
