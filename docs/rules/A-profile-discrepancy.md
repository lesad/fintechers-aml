# Alert type A: client profile discrepancy

**Status:** draft. **Owner:** Adrián (second layer). **Alert unit:** one per client per run.

Type A carries the volume (5,493 alerts on July, every client) and triage is 40% of the FINREG grade. Detection is settled; the work is in triage and priority.

## Source

> Daily volume in July 2026 is greater than 25% of the projected monthly volume, or greater than 3x the average daily volume in Q2 2026; or a single transaction is greater than 2x the maximum transaction in Q2 2026. Clients inactive in Q2 2026 are compared to projected volumes only.

## 1. Seed rules (engine)

Migration `0004-seed-rules.sql`, author `finreg-brief`.

| Rule | Grain        | Tests                                                                 |
| ---- | ------------ | --------------------------------------------------------------------- |
| `A1` | `client_day` | the day's volume against the declared monthly volume                  |
| `A2` | `client_day` | the day's volume against the Q2 average day; skipped with no Q2 activity |
| `A3` | `transaction`| one payment against the Q2 maximum; skipped with no Q2 activity       |

## 2. Interpretation decisions

| Decision                         | Reading                                                                                                   | Status                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Day volume                       | Sum of all the client's transactions that day, any direction                                              | brief                        |
| Currency                         | Every amount in CZK at the ČNB fixing on or before the date                                               | brief; law (Act §54(3))      |
| Declared volume period           | `expected_monthly_volume` is monthly                                                                      | confirmed by data            |
| Q2 day count                     | Calendar days, prorated from the contract date (`q2_days`, computed at import; 91 for older clients)      | company; prorating to confirm |
| Inactive in Q2                   | `q2_tx_count` is 0: A1 only                                                                               | brief                        |
| `transaction_id` in the CSV      | A3: the largest hit payment; A1, A2: the largest payment on the day with the highest `day_volume`         | confirmed (team, 2026-10-19) |

K005492 (contracted 30 June) is the one client with no Q2 activity, so only `A1` can fire for it.

## 3. Evidence contract and `llm_context`

Every type A rule's evidence carries its grain key, the amount it tested (`day_volume` for a day grain, `tx.amount` for a transaction grain) and its resolved parameters. The second layer derives the rest from the client's fields and transactions.

| Field                  | Meaning                                                                          | Source       |
| ---------------------- | -------------------------------------------------------------------------------- | ------------ |
| `day_volume`, `tx.amount` | The tested amount, in CZK                                                     | evidence     |
| `p.*`                  | The parameter values in force                                                    | evidence     |
| rules hit, hit count   | Distinct rule keys and number of hits on the alert                               | `alert_hit`  |
| `count_gap`            | July count over the prorated Q2 monthly count                                    | second layer |
| `count_gap_peer_pct`   | Percentile of `count_gap` in the client's peer group                             | second layer |
| `max_raw_peer_pct`     | Percentile of the largest July payment in raw `volume` within the peer group      | second layer |
| `czk_tx_vs_q2_max`     | Largest CZK-currency payment over `q2_max_tx` (no FX involved)                   | second layer |
| `fx_share`             | Share of July CZK volume paid in a foreign currency                              | second layer |
| `tenure_days`          | Days from the contract date to 1 July 2026                                       | second layer |
| other alerts           | B or C alerts on the same client in the run                                      | second layer |

`llm_context` for the summary is all of the above plus the client's type, country, channel and risk score.

Why the derived fields: after CZK conversion every client trips type A, and the converted ratio mostly sorts clients by a small declared count (about 119 / `expected_count`, [data-patterns.md](../challenge/data-patterns.md)). The count gap and the raw largest payment rank on behaviour instead. The CZK ratio stays in `reason`, because it is the brief's form.

## 4. Guardrails

| Guardrail                          | Effect | Basis                                                         |
| ---------------------------------- | ------ | ------------------------------------------------------------- |
| Client is a PEP                    | REVIEW | Act §9a, AMLR Art. 42: enhanced due diligence                 |
| AML risk score is high             | REVIEW | AMLA draft para 78: no automated closure for higher risk      |
| A B or C alert on the same client  | REVIEW | AMLR Art. 69(2): linked transactions; company                 |
| No Q2 activity, or tenure under 7 days | REVIEW | thin baseline; company                                    |
| Tenure under 90 days               | REVIEW | FATF, FAÚ: activity soon after opening; company               |

## 5. Triage policy

Code only, proposal A of the data run:

| Condition                                                    | Triage |
| ------------------------------------------------------------ | ------ |
| Any guardrail                                                | REVIEW |
| `count_gap_peer_pct` ≥ `a_gap_peer_pct`                      | REVIEW |
| `max_raw_peer_pct` ≥ `a_max_raw_peer_pct`                    | REVIEW |
| Anything else                                                | FP     |

| Parameter            | Value | Status                  |
| -------------------- | ----- | ----------------------- |
| `a_gap_peer_pct`     | 95    | company, tune on labels |
| `a_max_raw_peer_pct` | 95    | company, tune on labels |

Data run: REVIEW 1,150 clients, FP 4,343 (79%), counted without the guardrail on B or C alerts. That guardrail adds clients with a C alert (1,077 have one) and is not counted yet. Proposal B (P90 and a CZK payment above 2x the Q2 maximum) gives REVIEW 1,856. Every FP is sampled for human verification afterwards (ČNB benchmark 2/2023).

## 6. Priority and route

Inputs to [priority.md](priority.md): count-gap percentile (conduct discrepancy), raw largest payment percentile and `czk_tx_vs_q2_max` (amount), and the client factors every type shares. No floor of its own. Route: row A in [escalation.md](escalation.md).

## Reason template

> A ({rules_hit}): worst day {worst_day} at {day_volume} CZK, {day_vs_expected}x the declared monthly volume (threshold {p.projected_pct}%) and {day_vs_q2_avg_day}x the Q2 average day (threshold {p.avg_multiple}x). Behaviour: July count {count_gap}x the Q2 pace (peer percentile {count_gap_peer_pct}), largest payment at peer percentile {max_raw_peer_pct}; {fx_share_pct}% of volume in foreign currency. {decision_sentence}

`decision_sentence` names the deciding guardrail or policy line, for example "Closed as FP: no guardrail, count gap and largest payment below peer P95; queued for QA sampling."

## Test cases

Detection rows are pinned by `RuleAcceptanceTest`.

| Case                   | Input                                                    | Expected                             |
| ---------------------- | -------------------------------------------------------- | ------------------------------------ |
| Expected-volume branch | Expected monthly 100,000; a July day of 30,000           | Fires (0.30 > 0.25)                  |
| At the threshold       | Expected monthly 100,000; best day 25,000                | Does not fire (not strictly above)   |
| Q2 day branch          | Q2 volume 910,000 over 91 days; a July day of 31,000     | Fires (3.1 > 3)                      |
| Single transaction     | Q2 max 50,000; one payment of 100,001                    | Fires                                |
| Inactive in Q2         | No Q2 transactions; expected 100,000; best day 20,000    | Does not fire (expected branch only) |
| Prorated baseline      | Contract 1 June; Q2 volume 300,000; a July day of 31,000 | Q2 average day 10,000; fires (3.1)   |
| Conversion             | 1,000 EUR at a fixing of 24.50                           | 24,500 CZK                           |
| PEP guardrail          | PEP client, gaps below P95                               | REVIEW                               |
| Behaviour              | Not PEP, low risk, tenure 2 years, count gap at peer P97 | REVIEW                               |
| Close                  | Not PEP, medium risk, tenure 2 years, both below P95     | FP                                   |

## Open questions

- Auto-closure for medium-risk clients. The policy above closes them; the invariant draft (INV-12 in [app-rules.md](../challenge/app-rules.md)) allows auto-FP only for low risk. Both cite AMLA draft para 78. On July that is about 1,400 clients. Team or mentor decision.
- Prorating clients contracted in Q2 (adopted; confirm with FINREG), and the FP sample rate (ČNB).

## Change log

| Date       | Change                                                                 | Alerts               | FP share                | Agreement (n) |
| ---------- | ---------------------------------------------------------------------- | -------------------- | ----------------------- | ------------- |
| 2026-10-19 | Dry run as written, converted to CZK                                   | 5,493 (every client) | n/a                     | n/a           |
| 2026-10-19 | Data run, triage proposal A                                            | 5,493: REVIEW 1,150  | FP-eligible 4,343 (79%) | n/a           |
| 2026-10-19 | Data run, triage proposal B                                            | 5,493: REVIEW 1,856  | FP-eligible 3,637       | n/a           |
| 2026-10-19 | Engine run, seed rules `A1` to `A3`                                    | 5,493                | n/a                     | n/a           |
| 2026-10-19 | Jev questions dropped; triage is proposal A in code (ADR-0032)         | 5,493                | n/a                     | n/a           |
