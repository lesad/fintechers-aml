# Design brief, step 3: audit trail of a case

Brief for Claude Design. Builds on the review queue and the transaction detail (`docs/design/aml-review-queue`). Same look and feel: data-dense, tight spacing, colour only for risk, MoroSystems tokens. One variant, basic form.

## Purpose

The audit trail of **one flagged transaction (one case)**: how we arrived at its rating and decision. What data went in (including the client's profile at that moment), which rule versions ran, what each rule measured against which threshold, what the AI answered, what the policy and the people decided, and who did each step and when. Czech law requires exactly this record: who, when, on what basis, with what result (Decree 67/2018 §18(3)); a closure whose reason cannot be reconstructed counts as a failure (ČNB benchmark 2/2023).

The trail is **append-only**: entries are never edited or deleted. An undo is a new entry, not a removed one.

## Entry point and placement

- Primary: in the transaction detail's fixed top strip, in the **Case** block (under the status and "flagged … ago"), a quiet link **Audit trail →**. The strip never scrolls away, and the Case block is about this case.
- Optional, if it fits: under a recorded decision in the Decision panel, a link **View audit trail**.
- It opens a new tab in the existing tab bar, labelled e.g. `Audit · TX000123456`, with its own icon so it reads differently from a transaction tab. If that tab is open already, it switches to it.
- The page fits the window height; only its content scrolls (same rule as the other pages).

## What the page must show

1. **Header (fixed):** the case: transaction id, amount, date, direction and counterparty, alert type and rule rating, current status; and the client in short: id, type, PEP, AML risk score. A link back to the transaction tab.
2. **Timeline (scrolls):** the steps of this case, oldest first. Each step is one audit entry.
3. Each entry shows: time, **actor** with its kind (engine, AI model, policy, person), the step name, the result, a one-line reason. Its **inputs** (structured data) are collapsed by default and expand inline: show them as readable key/value rows, with a "raw JSON" toggle.
4. A side panel (or a section at the top of the timeline) with the **inputs the case was judged on**: the client's profile as used (contract, channel, PEP, risk score, expected monthly volume, Q2 statistics) and the rule versions with their parameters. These are snapshots, so they show what the decision saw even if the client data changes later.

For alert types A and C the case covers several of the client's transactions (a day or a 24 h / 6 h window); list them in the inputs of the rule step.

Not needed now: export, filters, search, editing anything.

## The data available

Synthetic data; nothing is real. Amounts are stored and shown in **CZK**.

### Client (table `client`)

| Field | Example |
| --- | --- |
| `id` | K003797 |
| `type` | legal entity / natural person / entrepreneur |
| `country` | CZ |
| `contract_date`, `channel` | 2019-03-14, in person / distant |
| `pep` | true |
| `risk` (AML risk score, given by the bank, not computed by us) | high |
| `expected_monthly_volume`, `expected_count` | 400,000 CZK / month, 55 transactions |
| `q2_volume`, `q2_tx_count`, `q2_max_tx`, `q2_days` | 1,620,000 CZK, 182, 61,400 CZK, 91 |

### Transaction (table `transaction`)

| Field | Example |
| --- | --- |
| `id`, `client_id`, `ts` | TX000123456, K003797, 2026-10-17 15:58 |
| `amount` (CZK), `volume` + `currency`, `fx_rate` | 184,500 CZK = EUR 7,352 at 25.095 |
| `direction` | in / out / unknown (remittance) |
| `payer_account`, `payee_account`, `payer_country`, `payee_country` | K003797 → AAT00116, CZ → AT |

### Run (table `run`): one execution of the rules over a period

| Field | Example |
| --- | --- |
| `id`, `kind` | 14, production |
| `period_from`, `period_to` | 2026-07-01 → 2026-07-31 |
| `started_at`, `finished_at` | 2026-10-19 09:02:11 → 09:03:40 |
| `rule_ids` | the exact rule versions that ran |

### Rule version (table `rule` + `rule_param`)

| Field | Example |
| --- | --- |
| `key`, `version`, `alert_type` | B2, v1, B |
| `layer` | company / segment / client |
| `condition` (CEL) | `client.pep && tx.amount > p.pep_min && tx.direction in ["out","unknown"]` |
| parameters | `pep_min` = 100,000 CZK |
| `status`, `author`, `approver`, `approved_at` | active, finreg-brief, J. Dvořák, 2026-10-18 |

Rules today: A1 (day volume > 25 % of expected monthly), A2 (day volume > 3× Q2 daily average), A3 (one transaction > 2× Q2 max), B1 (> 10,000 CZK touching a high-risk country), B2 (PEP outgoing > 100,000 CZK), C1 (> 100,000 CZK in within 24 h, ≥ 80 % out within 6 h).

### Rule hit (table `rule_hit`): one rule firing, with its evidence

| Field | Example |
| --- | --- |
| `rule` + `version` | B2 v1 |
| `grain_key` | the transaction id, the day, or the anchor transaction |
| `evidence` | every variable and parameter the rule evaluated, e.g. `tx.amount` 184,500 CZK, `p.pep_min` 100,000 CZK, `client.pep` true; for C1: `inflow`, `outflow`, `payers` (accounts), `p.forward_pct` 80 |

### Alert (table `alert`)

`id`, `alert_type` (A / B / C), `client_id`, `transaction_id` (for B; for A and C the largest transaction of the worst day/window), `created_at`, the hits it groups.

### Audit entry (table `audit_entry`): the trail itself

| Field | Meaning |
| --- | --- |
| `id` | sequence number; summaries cite it |
| `at` | timestamp |
| `actor` | `engine`, a model id, `policy`, or a person |
| `step` | what was done (catalogue below) |
| `result` | the outcome in one word or value |
| `inputs` | structured data the step looked at (JSON) |
| `reason` | one short sentence |

### Step catalogue (in order on a case)

| Step | Actor | Result | Inputs | Status |
| --- | --- | --- | --- | --- |
| `data_imported` | engine | rows loaded | file names, row counts, FX source (ČNB fixing date), high-risk list version (EU + FATF, July 2026) | planned |
| `rules_run` | engine | run id | period, rule versions with their approver | planned |
| `alert_raised` | engine | alert type (A/B/C) | the hits: rule, grain key, evidence | **built today** |
| `facts_computed` | engine | — | named values the decision uses: ratios, hours to forward, share forwarded, worst day | planned |
| `gates_checked` | policy | `always_review` / none | which hard rule applied (e.g. PEP never auto-closes) | planned |
| `ai_judgement` | model, e.g. `jev-1.13.0` (fallback `claude-sonnet-4.5`) | answer per question, e.g. "consistent with profile: no (p = 0.81)" | questions sent, full probability distribution, confidence, SHA-256 of what was sent | planned |
| `triage` | policy (with version) | `FP` / `REVIEW` | facts, gates, AI answers, thresholds applied | planned |
| `priority` | policy | 0–100 and band (low < 40, medium < 70, high) | points per factor (breakdown) | planned |
| `routed` | policy | executive role and approver role | escalation matrix row, e.g. B → `l2_analyst`, approver `compliance_officer` (+ `board_aml_member` for a PEP) | planned |
| `decision` | person, e.g. J. Novák | `Closed` / `Escalated` | the reason text | in the UI today |
| `decision_undone` | person | — | which decision | in the UI today |
| `approved` | second person (four eyes) | approved / returned | comment | planned |

Design all steps; the "planned" ones will be filled as the backend adds them.

## Sample trail for the mock

**Case TX000123456**: alert B, outgoing 184,500 CZK (EUR 7,352) from K003797 to AAT00116 (Austria), 2026-10-17 15:58. Client K003797: legal entity, PEP, risk high, contract 2019-03-14 in person, expected 400,000 CZK / month, Q2 1,620,000 CZK.

1. `data_imported` · engine · 397,853 transactions, 5,493 clients · FX ČNB fixings 2026, high-risk list July 2026
2. `rules_run` · engine · run 14 · July 2026, rules A1–C1 v1, approved by J. Dvořák
3. `alert_raised` · engine · B · "Rule B2 fired for client K003797." · evidence: tx.amount 184,500 CZK > p.pep_min 100,000 CZK, client.pep true, direction out
4. `gates_checked` · policy · always_review · "PEP alerts never close automatically."
5. `ai_judgement` · jev-1.13.0 · "regular counterparty: yes (p = 0.74)" · "Payee appears monthly with similar amounts (178,200 and 186,900 CZK)."
6. `triage` · policy v0.3 · REVIEW · "PEP gate"
7. `priority` · policy · 62 (medium) · PEP +20, risk high +15, amount +12, relationship 7 years −5 …
8. `routed` · policy · l2_analyst, approver compliance_officer + board_aml_member
9. `decision` · J. Novák · Escalated · "Monthly supplier payments, but source of funds for the PEP not documented."

A second state to mock: a case still open (no decision yet), e.g. **TX000004822**, alert A, rule A1 (day volume 560,000 CZK > 25 % of 400,000 CZK expected monthly), AI "seasonal spike seen in Oct 2024 and 2025" (p = 0.68), triage REVIEW, priority 41.

## Technical frame

React + Tailwind v4 in our own components (no component library). Reuse what the queue and the detail already have: the tab bar, `Card`, risk badges, the AI pill, status labels, the dense table. UI in English.
