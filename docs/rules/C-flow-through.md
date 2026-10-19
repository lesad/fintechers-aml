# Alert type C: flow-through account

**Status:** draft. **Owner:** Adrián (second layer). **Alert unit:** one per client per run.

Every type C alert goes to a person at priority 80 or more. On July the seed rule fires as often with time reversed, so priority rests on the shape of the flow, not on the hit itself.

## Source

> Within 24 hours the client receives incoming payments above CZK 100,000 and within 6 hours sends out at least 80% of that amount to another account (not the payer's account). Include any further red flags you identify.

## 1. Seed rules (engine)

| Rule | Grain                                   | Tests                                                                                       |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `C1` | `client_anchor`, each incoming payment | inflow in the 24 h up to the anchor against the outflow in the 6 h after it, payers excluded |

Version 1 is in `0004-seed-rules.sql`; version 2 (`0005-c1-remittances-as-outflow.sql`, author `docs-rules`) counts remittances as outflow and is the active one.

## 2. Interpretation decisions

| Decision            | Reading                                                                                                         | Status                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Inflow window       | Floating: the 24 h ending at each incoming payment. Anchoring on every inflow covers every window, since the sum changes only when money arrives | company; ask FINREG |
| "Above CZK 100,000" | The window's sum, not each payment                                                                              | company; ask FINREG          |
| Outflow window      | The 6 h after the anchor, the window's latest inflow                                                            | company; ask FINREG          |
| "Another account"   | Any payee that was not a payer in the inflow window                                                             | confirmed (team, 2026-10-19) |
| Remittances         | Count as outflow (direction `unknown`), never as inflow. 1,077 clients with them, 720 without                    | company; ask FINREG          |
| Midnight            | Windows are exact timestamps, never calendar days (16,217 qualifying windows span two dates)                   | company                      |

## 3. Evidence contract and `llm_context`

| Field              | Meaning                                                                 | Source       |
| ------------------ | ----------------------------------------------------------------------- | ------------ |
| `inflow`           | Inflow in the 24 h window, in CZK                                       | evidence     |
| `outflow`          | Qualifying outflow in the 6 h after, in CZK                             | evidence     |
| `payers`           | Payer accounts in the window                                            | evidence     |
| `p.*`              | The parameter values in force                                           | evidence     |
| qualifying windows | Number of hits on the alert                                             | `alert_hit`  |
| `forward_share`    | `outflow / inflow` of the strongest window                              | second layer |
| `hours_to_forward` | Hours from the anchor to the outflow that crossed the share             | second layer |
| flow shape         | `one_to_one`, `one_to_many`, `many_to_one`, `many_to_many` from distinct payers and payees | second layer |
| outflow abroad     | Every outflow leg to a foreign payee country                            | second layer |
| other alerts       | A or B alerts on the same client                                        | second layer |

`llm_context` adds the client's type, country, channel, tenure and risk score.

## 4. Guardrails

| Guardrail   | Effect               | Basis                                                                                             |
| ----------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| Every alert | REVIEW               | No source allows auto-closing a flow-through pattern; company                                     |
| Every alert | Priority at least 80 | company ([czech-aml-escalation.md](../challenge/czech-aml-escalation.md) section 6)              |

## 5. Triage policy

Always REVIEW.

## 6. Priority and route

Floor 80. Shape points from the data run (weights not fitted): `forward_share` 0.8 to 1.2 +10, above 2 −5 (one large unrelated outflow, not a pass-through); every outflow leg abroad +3. Other inputs to [priority.md](priority.md): `inflow` and the client factors. Route: row C in [escalation.md](escalation.md); no business purpose documented means an OPO by default.

## Reason template

> C: {inflow} CZK in within 24 hours ({payer_count} payers), {forward_share_pct}% of it out within {hours_to_forward} hours to {payee_count} other accounts (threshold {p.forward_pct}% within 6 hours). {qualifying_windows} qualifying windows in July. Flow-through alerts always go to review.

## Test cases

Detection rows are pinned by `RuleAcceptanceTest`.

| Case                | Input                                                                 | Expected                 |
| ------------------- | --------------------------------------------------------------------- | ------------------------ |
| Qualifies           | 60,000 + 50,000 in within 24 h; 90,000 out 3 h later to a new account | Fires (0.818)            |
| Below share         | Same, 85,000 out                                                      | Does not fire (0.773)    |
| Back to the payer   | Same, 90,000 out to one of the two payers                             | Does not fire (excluded) |
| Inflow at threshold | 100,000 in exactly                                                    | Does not fire            |
| Too late            | 110,000 in; 90,000 out 6 h 1 min after the last inflow                | Does not fire            |
| Across midnight     | 110,000 in at 22:00 and 23:30; 90,000 out at 01:00                    | Fires                    |
| Pass-through shape  | Fires with `forward_share` 0.9                                        | REVIEW, priority ≥ 80, +10 shape points |

## Open questions

Still open with FINREG: the floating window, sum or each payment, the window's start, and remittances.

## Change log

| Date       | Change                                                                                    | Alerts        | FP share       | Agreement (n) |
| ---------- | ----------------------------------------------------------------------------------------- | ------------- | -------------- | ------------- |
| 2026-10-19 | Data run, floating 24 h, 6 h after each inflow, remittances as outflow (720 without)      | 1,077 clients | 0 (all REVIEW) | n/a           |
| 2026-10-19 | Data run, same with the 6 h window before the inflow (null model; 740 without remittances) | 1,080 clients | n/a           | n/a           |
| 2026-10-19 | Engine run, `C1` v2                                                                       | 1,077         | 0 (all REVIEW) | n/a           |
| 2026-10-19 | Jev questions dropped; typology mule floor 90 dropped with them (ADR-0032)                | 1,077         | 0 (all REVIEW) | n/a           |
