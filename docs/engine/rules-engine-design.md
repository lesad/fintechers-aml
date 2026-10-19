# Monitoring rules engine — design

Status: approved 2026-10-19. Owner: Martin. Related: ADR-0024, `docs/challenge/README.md`, `docs/rules/` (the second layer's spec).

> **Updated 2026-10-19 (ADR-0025):** the frontend went further than this document assumed — it is now a client-only Vite + React SPA, so the app has no server, no Drizzle, no `db:*` scripts and no `compose.yaml` at all (not "reduced to starting the container"). The engine owns the container as well as the schema, and the browser calls its API directly. The frontend CI jobs are now `check` (unit) and `build` (Vite); there is no `integration` job for the `engine` check to join.

## Intent

FINREG's challenge asks for alerts from three red-flag rules (A, B, C) over July 2026 transactions, then triage, justification and escalation. This document covers the first layer only: a **monitoring rules engine** that stores rules in Postgres, runs them over every transaction, and writes alerts with the evidence that triggered them.

The engine is built so that rules can later be **written by people and proposed by an LLM**, and every rule change is checked before it goes live:

1. someone (or the model) proposes a rule in the rule language,
2. code type-checks it and, with a formal proof, shows what the change newly catches and no longer catches,
3. a backtest on July shows how many more or fewer alerts it raises (a later slice),
4. a second person approves it,
5. every step is logged.

That loop is the differentiator for the pitch. This slice builds steps 2 and 4 at the database and CLI level; the UI and the LLM come later (see Non-goals).

## Goals of this slice

- Load the ČNB data (clients, transactions, FX) into Postgres with every amount in CZK.
- A rule model in Postgres: detection rules written in **CEL**, aggregate variables, layered parameters, segments.
- Seed the challenge rules as six company rules (A1, A2, A3, B1, B2, C1) grouped into alert types A, B, C.
- Run the active rule set over July and produce exactly the alert set the challenge defines, with evidence per alert.
- Check a rule at save time: CEL type-check, satisfiability, and the **change summary proof** with the cel-java verifier (Z3).
- Approve a rule version (checks passed). Four-eyes enforcement (approver ≠ author, roles) is a later request.

## Non-goals (this slice)

- UI for editing rules. A colleague builds it later on top of these tables.
- The LLM proposing rules. The rule language and checks are designed for it; the integration is later.
- Triage (FP/REVIEW), priority score, justification text, escalation, the hash-chained audit log. These are the **second layer** (Adrián, Kotlin, LLM/Jev, specified in `docs/rules/`), which reads this engine's `alert` and `rule_hit` tables. The alert tables must not block it.
- **`llm_context`**: the per-alert description the second layer will hand to Jev (what `docs/rules/` calls "facts": worst day, CZK-only ratios, strongest window, hours to forward…). Computed by this engine as fixed Kotlin code per alert type once the second layer names what it needs. Not defined or built in this slice.
- ML and network analysis. Later layers that read the same tables.
- Backtesting a draft rule version. A later slice; the `run` table already has a `kind` for it.
- Deployment. Local only (ADR-0023).

## Anti-goals

- A rule language only we can read. Rules are standard CEL plus a small, documented aggregate notation.
- Any rule change that reaches production without the checks and an approval, whether a person or the model wrote it.
- Decisions made in SQL text assembled from user input. User-supplied values only ever reach SQL as bound parameters.
- Calendar-day approximations of time windows (rule C must be exact across midnight).

## Constraints

- Kotlin + Spring Boot service in this repo (ADR-0023); local Postgres from `compose.yaml` (`postgres:17-alpine`, `POSTGRES_URL` in `.env.local`).
- Code freeze Tuesday 20 October 13:30. Prefer the smallest version of each part that works end to end.
- The organisers' data stays in git-ignored `data/raw/` (filled by `pnpm data:pull`). Never commit it, never put it in fixtures.
- Reference list: `reference/high-risk-countries-2026-07.json` (31 ISO codes). Load ISO codes as plain strings; Namibia is `NA`.
- All money and ratios in the rule language are integers: CEL has no decimal type (a float would put rounding error on the 10,000 and 100,000 CZK thresholds), and the cel-java verifier slows down a lot on floats.
- Correctness oracle: the hand-made fixtures per rule. The DuckDB dry-run counts in `docs/challenge/data-profile.md` are a cross-check; the run report explains every difference.
- Rules run on CZK amounts as the brief requires; the original volume and currency stay stored. The data profile shows rule A then fires for every client; that is FINREG's question, not an engine change.

## Decisions taken in the conversation

- **Rule language:** CEL for conditions and filters, stored as text in Postgres. No JSON rule trees.
- **Split rules:** detection rules are small and single-purpose; several rules feed one alert type (A1–A3 → A, B1–B2 → B, C1 → C). The challenge's "one alert per client" for A and C, "per transaction" for B, is an alert-grouping property.
- **Layers:** company, client segment, client. There is no regulatory layer: in practice every monitoring rule is the institution's own decision (ADR-0027), and the FINREG rules are company rules. Every layer may add completely new rules. A segment or client layer may also suppress or replace a company rule for its scope, provided the change is approved by a manager (and, once backtesting exists, backtested).
- **Database:** Postgres, not DuckDB.
- **SQL only computes variables; Kotlin decides.** SQL selects rows and computes aggregates; the CEL runtime in Kotlin evaluates every rule condition.
- **CEL → SQL for filters:** try cel2sql4j first behind our own interface; if the spike fails, write our own translator for the subset we use.
- **Formal checks:** cel-java verifier (`dev.cel:verifier`, Z3) at save and approval time.
- Rule editing UI is out of scope; a colleague adds it later.
- **Two layers.** This engine is the deterministic first layer and owns its storage. `docs/rules/` specifies the second layer (Jev judgements, gates, triage, priority, routing) that runs on its alerts. The FINREG brief is the source of truth for what the rules detect; where `docs/rules/` interprets it (prorating, the 6-hour start, remittances), this engine follows.
- **Q2 baseline is prorated.** For the 239 clients who signed during Q2, the Q2 average day divides by the days since the contract, not 91 (their median Q2 transaction count is 85 vs 186 for older clients, but per active day 1.91 vs 2.04).
- **Parameter names and integer units stay as in this design;** the second layer formats them for display (25 → "25%").
- **Build order:** import → run → alerts → CSV first; the rule-change loop (checks, Z3 proofs, approval) follows later in the build; backtesting is a later slice.

## Calls I made (review these)

- Service lives in `engine/` at the repo root: Gradle Kotlin DSL, JDK 25 (current LTS), Spring Boot 4, Kotlin 2.3, `dev.cel` 0.14.x. Greenfield, so no reason to start on the previous generation; the Z3 and cel2sql4j spikes confirm the libraries run on JDK 25.
- **Only the engine touches the database.** Tables live in the default `public` schema, migrated by **Liquibase** from the engine, the same way as `cyrrus/backend`: `src/main/resources/db/changelog-master.xml` includes numbered SQL files `db/migrations/NNNN-<name>.sql`, each starting `--liquibase formatted sql`, with `--changeset <author>:<n>` and a `--rollback` line; `spring.liquibase.change-log: classpath:/db/changelog-master.xml`. The Next.js app gets no direct database access: its Drizzle client, schema, `db:*` scripts and DB integration harness are removed (or reduced to starting the container) in the implementation, and any UI reads through the engine later. Supersedes the Drizzle part of ADR-0021 (see ADR-0024). `pnpm db:reset` drops the whole volume, so the engine re-migrates on next start.
- Money is stored as **`bigint` haléře** (CZK × 100). Ratios are integer percentages.
- Data access with plain JDBC (`JdbcClient`) — the generated SQL is dynamic anyway; no JPA.
- The engine is driven by CLI commands (Spring Boot application arguments), no REST in this slice.
- Suppression is modelled as a replacing rule whose condition is `false`, so it goes through the same checks and approval path as any other replacement.
- Approval in this slice is a CLI command; the approver's name is a string argument (no auth).

## Data import

Command: `import`. Reads `data/raw/CNB/clients.csv`, `data/raw/CNB/transactions.csv`, `data/raw/cnb-fx/rok-2026.txt`.

- CSVs: semicolon-separated, UTF-8 with BOM, dates `DD.MM.YYYY`, decimal point. FX file: `DD.MM.YYYY|rate|…`, decimal comma, quantity per currency in the header (`100 HUF`, `100 INR`, `100 ISK`, `100 JPY`, `100 KRW`, `100 TRY`; divide by it).
- Conversion: use the last fixing **on or before** the transaction date. `amount = round_half_up(volume × rate / quantity × 100)` in haléře. Keep original volume, currency and the rate used.
- `ts` = date + time as `timestamp without time zone` (the data has local times and no zone).
- `direction`: `incoming payment` → `in`, `outgoing payment` → `out`, `remittance` → `unknown` (remittances always have an empty payer account).
- Client fields carried into the rule vocabulary: country, contract date, channel, `pep` (Y/N → bool), type, expected monthly volume, expected count, Q2 volume, Q2 count, Q2 max transaction, risk (`low`/`medium`/`high`), and computed `q2_days` = calendar days from the later of the contract date and 1 April 2026 to 30 June 2026, inclusive (91 for older clients; 30 for a 1 June contract). Note the data spells one type `enterpreneur`; keep it as delivered.
- Print a validation report: row counts (expect 5,493 and 397,853), currencies without a rate, nulls, duplicate IDs, negative volumes, clients with no Q2 activity. Import is idempotent (truncate the data tables, reload).

## Tables (schema `public`)

Data:

- `client` — one row per client, typed columns as above.
- `transaction` — id, client_id, ts, amount (haléře), original volume and currency, fx rate, payer/payee country, payer/payee account, type, direction. Index `(client_id, ts)`.
- `fx_rate` — date, currency, quantity, rate.
- `reference_list` — list name (`high_risk`), code, valid_for, source. Loaded from the reference JSON.

Rules:

- `rule` — immutable rule versions. Columns: `key` (e.g. `C1`), `version`, `alert_type` (`A`/`B`/`C`/further), `layer` (`company`/`segment`/`client`), `scope_segment_id`, `scope_client_id`, `grain` (`transaction`/`client_day`/`client_anchor`), `anchor` (CEL, only for `client_anchor`), `condition` (CEL), `replaces_key` (nullable), `status` (`draft`/`approved`/`active`/`retired`), `author`, `approver`, timestamps. At most one `active` version per `(key, scope)`.
- `rule_variable` — rule version, `name`, `agg` (`sum`/`max`/`min`/`count`/`set`), `field`, `filter` (CEL), window spec (see below).
- `rule_param` — rule `key`, `name`, `layer`, scope, integer `value`. The company row is the default.
- `segment` — id, name, `predicate` (CEL over `client`). Membership is computed, not stored.
- `rule_check` — rule version, check kind (`typecheck`/`satisfiable`/`not_always_true`/`change_summary`/`segment_overlap`), status (`verified`/`violated`/`inconclusive`/`error`), message incl. counterexample, timestamp.

Runs and results:

- `run` — id, kind (`production`; `backtest` reserved for the later slice), the frozen set of rule version ids, period, started/finished, counts per rule and alert type.
- `rule_hit` — run, rule version, client, grain key (transaction id, day, or anchor transaction id), `evidence` jsonb (every variable and resolved parameter value, plus the triggering transaction ids).
- `alert` — run, alert type, client, transaction (B only), created_at. `alert_hit` links alerts to hits. Later steps add triage, score, reason and escalation columns or tables here.

## Rule language

A rule is a CEL `condition` evaluated once per **grain row**, plus named **variables** computed by SQL for that row.

**Vocabulary** (declared with concrete types for the CEL compiler and the verifier):

- `tx` — the grain's transaction (grains `transaction` and `client_anchor`): `amount` (int, haléře), `ts`, `direction` (string), `payer_country`, `payee_country`, `payer_account`, `payee_account`, `type`, `currency`.
- `client` — `country`, `pep` (bool), `type`, `channel`, `risk`, `expected_monthly_volume`, `q2_volume`, `q2_tx_count`, `q2_max_tx`, `q2_days`, `contract_date`.
- `day` — for grain `client_day`: the calendar date.
- `p` — resolved parameters (ints).
- `lists` — reference lists, e.g. `lists.high_risk` (list of strings).
- each variable by name (`int` for `sum`/`max`/`min`/`count`, `list(string)` for `set`).

**Grains:**

- `transaction` — one row per July transaction.
- `client_day` — one row per client and calendar day with at least one transaction.
- `client_anchor` — one row per transaction matching the rule's `anchor` CEL (rule C: every incoming payment). Windows are measured from the anchor's `ts`. Anchoring on each incoming payment covers every possible 24-hour inflow window, because the inflow sum only changes when money arrives.

**Variables:** `agg(field, filter, window)`. Window is `day` (same calendar day as the grain row) or an interval relative to the anchor, e.g. `[-24h, 0]` (inclusive end) and `(0, +6h]`. A filter may reference an earlier variable of the same rule (C1's `payers`). Variables are computed in declaration order.

**Integers only.** Write ratios as multiplications: `outflow * 100 >= p.forward_pct * inflow`, not `outflow >= 0.8 * inflow`.

## Seed rules (company, version 1)

| key | type | grain                                        | condition                                                                                                                                            | params                              |
| --- | ---- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| A1  | A    | client_day                                   | `day_volume * 100 > p.projected_pct * client.expected_monthly_volume`                                                                                | projected_pct 25                    |
| A2  | A    | client_day                                   | `client.q2_tx_count > 0 && day_volume * client.q2_days > p.avg_multiple * client.q2_volume`                                                          | avg_multiple 3                      |
| A3  | A    | transaction                                  | `client.q2_tx_count > 0 && tx.amount > p.max_multiple * client.q2_max_tx`                                                                            | max_multiple 2                      |
| B1  | B    | transaction                                  | `tx.amount > p.country_min && (tx.payer_country in lists.high_risk \|\| tx.payee_country in lists.high_risk \|\| client.country in lists.high_risk)` | country_min 1000000 (10,000 CZK)    |
| B2  | B    | transaction                                  | `client.pep && tx.amount > p.pep_min && tx.direction in ["out", "unknown"]`                                                                          | pep_min 10000000 (100,000 CZK)      |
| C1  | C    | client_anchor, anchor `tx.direction == "in"` | `inflow > p.min_inflow && outflow * 100 >= p.forward_pct * inflow`                                                                                   | min_inflow 10000000, forward_pct 80 |

Variables:

| rule   | name       | agg | field         | filter                                                   | window    |
| ------ | ---------- | --- | ------------- | -------------------------------------------------------- | --------- |
| A1, A2 | day_volume | sum | amount        | `true` (both directions)                                 | day       |
| C1     | inflow     | sum | amount        | `tx.direction == "in"`                                   | [-24h, 0] |
| C1     | payers     | set | payer_account | `tx.direction == "in"`                                   | [-24h, 0] |
| C1     | outflow    | sum | amount        | `tx.direction == "out" && !(tx.payee_account in payers)` | (0, +6h]  |

Alert grouping: A and C → one alert per client per run (all hits attached); B → one alert per transaction (B1 and B2 on the same transaction → one alert, both hits).

Expected on this data: B1 fires zero times (no country in the data is on the July 2026 lists); only B2 fires (the DuckDB dry run in `docs/challenge/data-profile.md` found 112 PEP transactions on 22 of the 23 PEP clients). Assert this in the run report, not in the rules.

## Layer resolution

For each client, the effective rule set is:

1. every active company rule,
2. plus active rules scoped to any segment whose predicate matches the client,
3. plus active rules scoped to the client,
4. minus any rule whose `key` is named in `replaces_key` by an active rule in a more specific scope that covers this client.

Parameters resolve most-specific first: client, segment, company default. If a client matches two segments that set the same parameter, that is a configuration error: the run fails and names the client and segments. (The segment-overlap check below prevents it at save time.)

## Checks at save and approval

Run on every new rule version and every parameter override; results go to `rule_check`.

1. **Type-check** — compile `condition`, `anchor`, every `filter` and segment predicate against the vocabulary. Errors carry positions (they are the retry signal for the future LLM loop).
2. **Satisfiable** — `isSatisfiable(condition)`: reject a rule that can never fire. Skipped for a suppression (condition `false` on purpose).
3. **Not always true** — reject a condition that is always true (it would alert on every row).
4. **Change summary** (informative): for a new version, a replacement, a suppression or a parameter override, prove which inputs the old and the new rule disagree on (parameters substituted as constants) and store counterexamples in both directions ("now also catches…", "no longer catches…") for the approver.
5. **Segment overlap** — on segment save, `isSatisfiable(a && b)` against every other segment; overlap is stored as a warning with an example client.

Domain assumptions given to the verifier as `assume` constraints: amounts, counts and every `sum`/`max`/`count` variable ≥ 0; `day_max ≤ day_volume` where both exist; `q2_tx_count ≥ 0`. Without them the solver returns impossible counterexamples.

## Approval

Command `approve <rule-version> --by <name>` sets `active` (retiring the previous active version for that key and scope) only if:

- every check passed (the change summary is informative and never blocks),
- the approver is recorded as the manager (no role model yet; recorded as given).

Four-eyes enforcement (approver ≠ author, approver roles) is deliberately left for a later request.

## Execution pipeline

Command `run [--period 2026-07]`:

1. **Resolve** the effective rule set and parameters per client (above).
2. **Compile variables to SQL** per rule: the grain decides the base rows; each variable becomes a `LATERAL` subquery whose window is a range on `ts` and whose filter is the CEL filter translated to a SQL `WHERE`. Field names map `tx.x` → the subquery's transaction alias. A reference to an earlier variable maps to that subquery's column (`tx.payee_account in payers` → `t.payee_account = ANY(i.payers)`). Every value — parameters, list contents, period — is a bound parameter.
3. **Postgres returns one row per grain row** with every variable computed.
4. **CEL evaluates the condition** in Kotlin for each row, with activation `{tx, client, day, p, lists, <variables>}`. Same CEL semantics the verifier reasons about; no second translation of conditions.
5. **Write `rule_hit`** for every true result, with the activation as evidence.
6. **Group into `alert`** per alert type.
7. **Export** `out/alerts-<run>.csv` with the challenge's first columns (`alert_id, alert_type, client_id, transaction_id`) plus an evidence column. For per-client alerts `transaction_id` is the largest transaction on the worst day (A: the day hit with the highest ratio) or in the strongest window (C: the anchor hit with the highest forwarded share). The remaining challenge columns (`triage, priority, executive_role, executive_person, approver, reason, log`) are filled by later steps.

Rough SQL shape for C1 (the builder generates it):

```sql
select a.id as anchor_id, a.client_id, i.inflow, i.payers, o.outflow
from transaction a
cross join lateral (
  select coalesce(sum(t.amount), 0) as inflow, array_agg(distinct t.payer_account) as payers
  from transaction t
  where t.client_id = a.client_id and t.direction = 'in'
    and t.ts > a.ts - interval '24 hours' and t.ts <= a.ts) i
cross join lateral (
  select coalesce(sum(t.amount), 0) as outflow
  from transaction t
  where t.client_id = a.client_id and t.direction = 'out'
    and t.ts > a.ts and t.ts <= a.ts + interval '6 hours'
    and not (t.payee_account = any(i.payers))) o
where a.direction = 'in'
```

NULL trap: `array_agg` keeps NULLs, and `x = ANY(array with NULL)` yields NULL for non-matches, which silently drops rows. `set` aggregates must exclude NULLs (`array_agg(...) filter (where ... is not null)`), with a test.

**Backtest (later slice, not built now)** — `backtest <rule-version>`: the same pipeline with the candidate swapped into the active set (replacing its predecessor or the rule it `replaces`). Stored as a `run` of kind `backtest` linked to the latest production run. Report: alerts added and removed per alert type and client, and agreement with labels once a labels table exists.

## CEL → SQL for filters

Our own `FilterCompiler` interface: `compile(celFilter, aliases) → (sql, params)`.

First implementation: **cel2sql4j** (`com.spandigital:cel2sql4j`, MIT, Java port of SPANDigital's Go cel2sql). Spike before relying on it (time-box ~30 minutes):

- compile the three seed filters and C1's anchor; read the SQL;
- check parameterised output with a start index and column aliases embed into the lateral query;
- check it resolves and works with `dev.cel` 0.14.x (it pins 0.13.1; the verifier needs 0.14.0);
- check NULL behaviour on `in`.

If any check fails, write our own translator for the subset: literals, field access, `== != < <= > >=`, `&& || !`, `in` with a list literal or a `set` variable, arithmetic on ints. Unsupported nodes are a compile error, never a silent pass.

## Z3 / verifier risk

`dev.cel:verifier` loads Z3 through `tools.aqua:z3-turnkey` (bundled native binaries). Not yet confirmed on Apple Silicon macOS. Spike first: prove `inflow > 100 ⇒ inflow > 50` from Kotlin. If it fails to load, the change summary is stored as `inconclusive` and the rest of the engine is unaffected.

## Testing

- Unit fixtures per rule, hand-made, 5–10 rows each, with known hits. Never real data. Start from the detection test cases in `docs/rules/A-profile-discrepancy.md`, `B-high-risk-pep.md` and `C-flow-through.md` (thresholds, prorated baseline, 6 h 1 min too late, across midnight, back to the payer).
- Edge cases each get a named test: C1 window across midnight; C1 outflow back to a payer's account is excluded; C1 with a remittance (no payer) in the window; A2/A3 skipped for a client with no Q2 activity; B2 with direction `unknown`; one A alert for a client that trips A1 on several days; FX on a weekend uses the last fixing; JPY/HUF quantity 100.
- Checks: the change summary for a looser C1 replacement (`min_inflow` 200,000) reports "no longer catches inflow 150,000 / outflow 120,000"; satisfiability rejects `x > 5 && x < 3`.
- Full run on the real July data locally: counts per rule and alert type printed; whole run under ~2 minutes (target, not a contract).
- CI: a GitHub Actions job `engine` runs `./gradlew build` for `engine/` on every PR (Temurin JDK 25 via `actions/setup-java`, Gradle cache, the Gradle wrapper committed and validated, a Postgres 17 service container like the `integration` job, dependency versions pinned). Once green it joins `check`, `integration` and `build` as a required check in `.github/rulesets/main.json`, so `main` only merges with a passing engine build. The Next.js jobs drop their DB steps when the app loses DB access. Data-dependent runs (the real July data) stay local.

## Open questions (FINREG, not blocking the build)

All are parameters or mappings, so an answer is a data change:

- Prorating the Q2 baseline by days since the contract (adopted; confirm). Calendar days, not business days.
- Where does C's 6-hour window start? We count from the latest incoming payment in the 24-hour window.
- Which high-risk list does FINREG mean? (`reference_list`)
- Is remittance direction "unclear"? We map it to `unknown`.

## Later (shapes this design, not built now)

- LLM proposes CEL rules → type-check errors fed back → checks → backtest → approval. Same tables.
- Rule editing UI in the Next.js app, reading and writing rules through the engine.
- Triage, priority, justification, escalation, hash-chained log on top of `alert`.
- More verifier uses: redundant-rule detection, generated test cases from witnesses, rule-set coverage invariants, auto-close and escalation policies written in CEL and proven.
- ML features and network analysis (shared counterparties) feeding new variables.
