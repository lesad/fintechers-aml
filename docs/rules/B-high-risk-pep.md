# Alert type B: high-risk jurisdiction or PEP

**Status:** draft. **Owner:** Adrián (second layer). **Alert unit:** one per transaction.

Every type B alert goes to a person, so triage is a guardrail and the work is in priority and route.

## Source

> A transaction above CZK 10,000 where the payer, payee or client country is on the EU or FATF high-risk jurisdictions list; or an outgoing transaction of a Politically Exposed Person above CZK 100,000 (where direction is unclear, any transaction).

Purpose, FINREG kickoff slide 'Red flag identification ruleset', 2026-10-19:

> Few alerts, high severity — tests prioritisation and escalation to the right level

## 1. Seed rules (engine)

Migration `0004-seed-rules.sql`, author `finreg-brief`. A transaction that trips both rules is one alert with both hits.

| Rule | Grain         | Tests                                                               |
| ---- | ------------- | ------------------------------------------------------------------- |
| `B1` | `transaction` | payer, payee or client country on `lists.high_risk`, above the floor |
| `B2` | `transaction` | a PEP's outgoing or direction-unknown payment, above the floor      |

## 2. Interpretation decisions

| Decision          | Reading                                                                                  | Status            |
| ----------------- | ---------------------------------------------------------------------------------------- | ----------------- |
| The list          | `reference/high-risk-countries-2026-07.json`, loaded into `reference_list` as `high_risk` | company; ask FINREG |
| Direction unclear | Remittances have no payer account and import as `unknown`; `B2` counts them               | confirmed by data |

The list is data: swapping it (for example the 2024 FATF grey list with ZA and TR) is a reload and a rerun, not a rule change.

## 3. Evidence contract and `llm_context`

| Field                 | Meaning                                                      | Source       |
| --------------------- | ------------------------------------------------------------ | ------------ |
| `tx.amount`           | The payment, in CZK                                          | evidence     |
| `p.*`                 | The parameter values in force                                | evidence     |
| rules hit             | `B1`, `B2` or both                                           | `alert_hit`  |
| matched parties       | Which of payer, payee and client country is listed, and the code | second layer |
| direction             | `out`, `in` or `unknown`                                     | second layer |
| PEP alerts in the run | The client's other type B alerts                             | second layer |
| other alerts          | A or C alerts on the same client                             | second layer |

`llm_context` adds the client's type, country, channel and risk score.

## 4. Guardrails

| Guardrail                     | Effect               | Basis                                                                       |
| ----------------------------- | -------------------- | --------------------------------------------------------------------------- |
| Every alert                   | REVIEW               | Act §9a, AMLR Art. 42: enhanced due diligence; AMLA draft para 78           |
| PEP and a listed country      | Priority at least 80 | company                                                                     |
| PEP relationship to continue  | Approver is the board AML member or delegate | Act §9a(3)(d); AMLR: senior management                 |

## 5. Triage policy

Always REVIEW.

## 6. Priority and route

Inputs to [priority.md](priority.md): PEP, country, amount. Route: row B in [escalation.md](escalation.md).

## Reason template

> B ({rules_hit}): {direction} payment of {amount} CZK (threshold {threshold}). {matched_parties_sentence} {pep_sentence} Type B alerts always go to review: enhanced due diligence applies to PEPs and high-risk countries.

## Test cases

Detection rows are pinned by `RuleAcceptanceTest`.

| Case                 | Input                                                 | Expected                                       |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| PEP outgoing above   | PEP, outgoing, 100,001 CZK                            | Fires, `B2`                                    |
| PEP at threshold     | PEP, outgoing, 100,000 CZK                            | Does not fire                                  |
| PEP incoming         | PEP, incoming, 500,000 CZK                            | Does not fire                                  |
| PEP remittance       | PEP, remittance, 150,000 CZK                          | Fires (direction unknown)                      |
| Country on list      | Non-PEP, payee country on the list, 10,001 CZK        | Fires, `B1`, party payee                       |
| Country at threshold | Same, 10,000 CZK                                      | Does not fire                                  |
| Both                 | PEP, outgoing, 200,000 CZK, payee country on the list | One alert, both hits; priority at least 80     |

## Open questions

Decided (team, 2026-10-19, mentor question 1): the approver is AML staff or higher, and the board AML member or delegate for a PEP. Still open: which high-risk list (3), and whether the UI groups a client's per-transaction alerts (112 alerts on 22 clients).

## Change log

| Date       | Change                                    | Alerts                          | FP share       | Agreement (n) |
| ---------- | ----------------------------------------- | ------------------------------- | -------------- | ------------- |
| 2026-10-19 | Dry run, converted, July 2026 list        | 112 PEP (22 clients), 0 country | 0 (all REVIEW) | n/a           |
| 2026-10-19 | Engine run, seed rules `B1`, `B2`         | 112 (22 clients)                | 0 (all REVIEW) | n/a           |
