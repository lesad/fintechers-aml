# Glossary

One meaning per term, for people and agents. The detection terms are the engine's own (`docs/engine/rules-engine-design.md`, the `rule*` tables in `engine/src/main/resources/db/migrations/`); where this page and the engine disagree, the engine wins and this page is fixed. Decision: ADR-0032.

## The pipeline

| Stage     | Who                    | In                                       | Out                                              |
| --------- | ---------------------- | ---------------------------------------- | ------------------------------------------------ |
| 1 Detect  | engine (Kotlin, CEL)   | transactions, clients, active rule set   | hits with evidence, grouped into alerts          |
| 2 Triage  | second layer (Kotlin)  | alert, its evidence, client fields       | triage decision, priority, route, reason, log    |
| 3 Review  | a person               | the alert, its evidence and log          | outcome, approval                                |
| 4 Assist  | AI                     | `llm_context`, alerts, outcomes          | summary, rule proposals                          |
| 5 Tune    | a person approves      | a rule proposal and its checks           | a new rule version; backtest against the old one |

AI never takes part in stages 1 to 3. Stages 4 and 5 are designed; approval is built (ADR-0044), while the engine's checks and backtest are not built yet.

## Detection (engine)

| Term                | Meaning                                                                                                                                                                                                   | Avoid                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| alert type          | The category an alert belongs to: A profile discrepancy, B high-risk country or PEP, C flow-through. Fixed by the brief. Sets the alert unit.                                                             | rule A (for the type)                       |
| alert unit          | What one alert covers: one per client per run (A, C) or one per transaction (B). A grouping property of the alert type.                                                                                  |                                             |
| rule                | One CEL condition under an alert type, identified by its `key` (`A1`, `A2`, `A3`, `B1`, `B2`, `C1`). Many rules feed one alert type. Rules are configured at runtime; the docs do not list them all.    | branch, scenario, detector, red flag        |
| seed rule           | A rule loaded by a migration: the six brief rules, author `finreg-brief`.                                                                                                                                 |                                             |
| grain               | The row a rule is evaluated on: `transaction`, `client_day` or `client_anchor` (one row per transaction matching the anchor, rule C: each incoming payment).                                             |                                             |
| variable            | A named aggregate the rule reads, computed in SQL: `agg(field, filter, window)`, for example `day_volume`, `inflow`, `payers`.                                                                          | fact (for this)                             |
| vocabulary          | The fields a condition may use: `tx.*`, `client.*`, `day`, `p.*`, `lists.*` and the rule's variables. Defined in `engine/.../cel/Vocabulary.kt`.                                                         |                                             |
| parameter           | A named numeric threshold of a rule, `p.<name>`, fixed by the rule version. Money is in CZK, ratios in whole percent.                                              | constant, setting                           |
| layer               | Where a rule or parameter applies: company, segment, client. A more specific layer may add, replace or suppress a company rule.                                                                         | regulatory layer (dropped, ADR-0027)        |
| segment             | A named group of clients defined by a CEL predicate over `client`.                                                                                                                                         | peer group (that is the data run's term)    |
| rule version        | An immutable version of a rule, with status `draft`, `pending`, `approved`, `active` or `retired`. At most one active version per key and scope.                                                                   |                                             |
| check               | What runs on a new rule version before approval: type-check, satisfiable, not always true, change summary, segment overlap.                                                                             |                                             |
| change summary      | The verifier's informative output for a change: what it now also catches and no longer catches. It never blocks approval.                                                                             | diff (for this)                             |
| approval            | A named person activates a rule version that passed its checks.                                                                                                                                           |                                             |
| run                 | One execution of the active rule set over a period: `production`, or `backtest` with a candidate swapped in.                                                                                            |                                             |
| backtest            | A run with a candidate rule version, compared with the latest production run: alerts added and removed per alert type and client.                                                                       | diff, what-if                               |
| hit                 | One grain row on which a rule's condition was true. Stored in `rule_hit`.                                                                                                                                  | flag                                        |
| evidence            | What a hit stores: every variable, every resolved `p.*` value and, for transaction grains, `tx.amount`. Deterministic; it says exactly what broke.                                                       | fact, finding                               |
| alert               | One row per alert unit, linking its hits. The brief's "red flag".                                                                                                                                          | red flag, flag, case (for the row)          |

## Second layer (triage and after)

| Term                | Meaning                                                                                                                                                                                                   | Avoid                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| evidence contract   | The evidence fields every rule of an alert type promises, so triage can read any rule of the type, including one added at runtime. Listed in each alert type's spec.                                    |                                             |
| triage              | The step after detection: code turns an alert into a triage decision, a priority and a route. No model.                                                                                                  |                                             |
| triage decision     | `FP` or `REVIEW`, the brief's `triage` column.                                                                                                                                                            | verdict, disposition, AI rating             |
| guardrail           | A hard constraint code applies no matter what a score says. Kinds: triage gate, priority floor or cap, approver requirement, human-only outcome. Never changed through the rule loop.                   | hard rule (for a detection rule)            |
| triage gate         | A guardrail that forces `REVIEW`, for example every B alert.                                                                                                                                              | gate (alone: CI and pre-commit use it too)  |
| priority            | 0 to 100 per alert, from the scorecard ([rules/priority.md](rules/priority.md)): points per factor, then floors, then a range check.                                                                     | risk, score, rating                         |
| priority factor     | A scorecard input with its points.                                                                                                                                                                        | factor (alone), risk factor                 |
| band                | Priority grouped: low 0 to 39, medium 40 to 69, high 70 to 100.                                                                                                                                            | risk level                                  |
| route               | Executive role, person and approver for the alert, from [rules/escalation.md](rules/escalation.md).                                                                                                      |                                             |
| outcome             | What a person decided in review: close, escalate to EDD, restrict, exit, file an OPO.                                                                                                                     | triage (for this)                           |
| reason              | The `reason` column: a template filled from the rule key, the evidence and the deciding guardrail or policy line.                                                                                       |                                             |
| log                 | The `log` column, exported from the alert's `audit_entry` rows: `actor`, `step`, `result`, `inputs`, `reason`, `at`. A run writes `alert_raised`; triage and the summary append their own steps.                 | audit trail (same thing)                    |
| invariant           | A property every alert record must have, checked when it is built and again at export: a decided alert has a reason and a log, 4-eyes, no analyst name in the export, a retention stamp.               | rule                                        |
| case                | In the UI, one client's open alerts reviewed together.                                                                                                                                                     |                                             |

## AI

| Term                | Meaning                                                                                                                                                                                                   | Avoid                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `llm_context`       | The per-alert description the engine computes for the AI: evidence plus derived values the second layer names. Not built yet.                                                                            | facts                                       |
| summary             | AI-written text for a person, built from `llm_context` and the log. Decides nothing.                                                                                                                     | assessment, judgement                       |
| rule proposal       | A draft rule version written by AI (or a person) in the rule language. Goes through the same checks, backtest and approval as any rule.                                                                 | AI rule                                     |
| suggestion          | A rule change the engine drafts from a reviewer's false-positive reason; the response form of a rule proposal, checked but not saved.                                                                   |                                             |

## Origin

Every rule and parameter records where it came from. Origin explains a value; it does not lock it (ADR-0027: every monitoring rule is the institution's own).

| Origin      | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `brief`     | FINREG's challenge text. Not statutory.                        |
| `law`       | Czech or EU law. Binds guardrails, not detection thresholds.   |
| `guidance`  | AMLA drafts, EBA, ČNB benchmarks. Cited, not binding.          |
| `company`   | Our choice, including the data run's defaults.                 |
| `ai`        | Proposed by AI and approved by a person.                       |

Hard means a guardrail with origin `law` or `brief`. Everything in the rule set is soft: editable through checks and an approval.

## Data

| Term              | Meaning                                                                                                                                       | Avoid                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| CZK amount        | `tx.amount`, converted at the ČNB fixing on or before the date. What every rule reads.                                                       |                           |
| raw amount        | The transaction's original `volume` in its own currency. The generator drew it without regard to currency.                                  |                           |
| declared profile  | The client's `expected_monthly_volume` (monthly, in CZK) and `expected_count` at contract.                                  | projected (except quoting) |
| declared ticket   | Declared monthly volume over declared count.                                                                                                  |                           |
| Q2 baseline       | `q2_volume`, `q2_tx_count`, `q2_max_tx` over `q2_days`, which the import prorates from the contract date (91 for older clients).            |                           |
| tenure            | Days from the contract date to 1 July 2026. "New" means under 90 days.                                                                        |                           |
| third country     | Outside the EU and EEA.                                                                                                                       | far, non-EU               |
| foreign           | Not the client's own country.                                                                                                                 |                           |
| distant           | The contract channel only.                                                                                                                    | remote                    |
| peer group        | Data run only: client type, risk score and channel, merged where under 50 clients.                                                           | segment                   |
| hub               | Data run only: a counterparty account shared by 200 or more clients (every CZ and SK account).                                              |                           |
