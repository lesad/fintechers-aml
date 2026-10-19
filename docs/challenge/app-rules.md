# App rules: what the code enforces

The implementation spec. Every rule here is something the app checks, computes or rejects.

**Legal context, citations and what was deliberately excluded live in [aml-hard-rules.md](aml-hard-rules.md).** This file carries no justification — if you need to know *why* a rule exists, or what it was degraded from, go there.

Two layers:

- **Layer 1 — Detection.** Which transactions become alerts. Thresholds are **FINREG's, from the challenge brief. They are not statutory.**
- **Layer 2 — Invariants.** Constraints on how an alert may be decided, routed and recorded. Derived from statute. An alert that violates one is a bug, not a judgement call.

---

## Layer 1 — Detection rules

All amounts converted to CZK using the last ČNB fixing on or before the transaction date. Client volume = sum of all a client's transactions regardless of direction.

| Rule | Alert unit | Trigger |
| --- | --- | --- |
| **A** — client profile discrepancy | one per **client** | Daily volume in July 2026 `> 25%` of projected monthly volume **OR** `> 3×` average daily volume in Q2 2026 **OR** a single transaction `> 2×` max transaction in Q2 2026. Clients inactive in Q2 2026 compare against projected volume only. |
| **B** — high-risk jurisdiction / PEP | one per **transaction** | Transaction `> CZK 10 000` where payer, payee **or** client country is on the high-risk list **OR** an outgoing transaction of a PEP client `> CZK 100 000` (where direction is unclear, any transaction). |
| **C** — flow-through account | one per **client** | Within 24 h the client receives incoming payments `> CZK 100 000` and within 6 h sends out `≥ 80%` of that amount to an account **other than the payer's**. |

### Detection constants

```ts
export const DETECTION = {
  a: { projectedMonthlyPct: 0.25, avgDailyMultiple: 3, maxTxnMultiple: 2 },
  b: { countryMinCzk: 10_000, pepOutgoingMinCzk: 100_000 },
  c: { inflowMinCzk: 100_000, inflowWindowHours: 24, outflowWindowHours: 6, outflowRatio: 0.8 },
} as const
```

Keep these in one module and **never inline them in rule bodies**. They are calibration, they will be questioned by the jury, and they must be quotable in one place.

### Detection notes

- **Rule A** — "projected monthly volume" has no period stated in the data. Treat the `expected volume at contract` column as monthly; this is an assumption, surface it in the reason text.
- **Rule A** — the Q2 daily average needs a day count. Use 91 calendar days; make it a constant, not a literal.
- **Rule B** — remittances have an empty payer account, so direction is unclear. The brief's "where direction is unclear, any transaction" covers them.
- **Rule B** — expect **zero** country-branch hits on the July 2026 lists. Report the zero; do not hide it.
- **Rule C** — needs the counterparty account comparison. Remittances have no payer account and cannot satisfy "not the payer's account"; decide and document how they are treated.

---

## Layer 2 — Invariants

`A` = alert row, `C` = client record. Each either **rejects** (cannot be constructed/exported) or **forces** a value.

### Decision record

| ID | Rule | Implementation |
| --- | --- | --- |
| **INV-1** | No alert is decided without a decision log. | Zod refinement on the alert row: `triage` set ⇒ `reason` and `log` both non-empty. Make the invalid state unconstructable rather than validating after the fact. |
| **INV-2** | A false positive carries its reasoning too. | `triage === "FP"` ⇒ `reason` cites ≥1 basis from the enum **and** ≥1 numeric feature value. Reject a bare `"OK"` — model it as a `ReasonBasis` enum plus a non-empty `citedFeatures` array, so a free-text string alone cannot satisfy it. |
| **INV-3** | The reason is reconstructable. | `reason` must contain the rule id and the values that fired it. Generate it from `{ruleId, citedFeatures}` — never hand-write or let the model emit it free-form. Example: `A: daily=412,300 CZK > 3× avg=98,100 CZK`. |
| **INV-4** | The log answers who / what / when / on what basis / with what result. | `log` is a structured array, not prose: `{actor, action, timestamp, basis: {ruleId, citedFeatures}, result}[]`. Serialise to text only at CSV write. |

### Triage gates

| ID | Rule | Implementation |
| --- | --- | --- |
| **INV-5** | A PEP alert is never auto-closed. | `C.pep` ⇒ force `triage === "REVIEW"`. Gate runs **before** a triage decision is accepted, so the model is never asked for one it cannot give. |
| **INV-6** | A PEP alert demands an explicit source-of-funds finding. | Reviewer checklist field `sourceOfFunds: "known" \| "unknown"`, required when `C.pep`. `"unknown"` ⇒ escalate, never FP. Not derivable from the data — a human input, defaulted to `"unknown"`. |
| **INV-7** | A high-risk-jurisdiction alert is never auto-closed. | `country(client ∥ payer ∥ payee) ∈ highRiskList` ⇒ force `triage === "REVIEW"`. List from `reference/high-risk-countries-2026-07.json`. |
| **INV-12** | Auto-closure only for the no-indicator case. | Auto-FP permitted **only** when `riskScore === "low"` **and** `!pep` **and** no high-risk country **and** the client has exactly one flag. Everything else goes to a human. Implement as a single `canAutoClose(alert, client): boolean` predicate — the only place auto-FP is granted. |

### Routing and approval

| ID | Rule | Implementation |
| --- | --- | --- |
| **INV-8** | 4-eyes — the approver is not the preparer. | `triage === "REVIEW"` ⇒ `executive_person` and `approver` both non-empty **and** `approver !== executive_person`. Zod refinement; also assert in the export pass. |
| **INV-9** | A continuing PEP relationship needs board-level approval. | `C.pep` ⇒ `roleOf(approver) ∈ regime.pepApproverRoles`. Roster-driven — see the config block. |
| **INV-11** | A restricting outcome is never model-final. | `outcome ∈ {"escalate-to-edd", "restrict", "exit"}` ⇒ `decidedBy.kind === "human"`. Type the decision as a discriminated union `{kind: "human", personId} \| {kind: "model", modelId, score}` so a model decision cannot occupy a human slot. |
| **INV-10** | The detecting analyst is not named in the report export. | Keep `detectedBy` on the internal record; **omit it from the OPO export projection**. Two distinct output types, not one type with a flag — the export type simply has no such field. |

### Stamps and timers

| ID | Rule | Implementation |
| --- | --- | --- |
| **INV-13** | Every alert carries a retention stamp. | `retainUntil = decisionDate + regime.retentionYears`. Computed at decision time, stored, never recomputed. |
| **INV-14** | PEP treatment survives loss of office. | `regime.pepTailMonths` (12 in both regimes). **Not evaluable on this dataset** — no office-end date exists. Carry as config and mark it unexercised; do not fake it. |
| **INV-15** | FAÚ response capability. | `slaDueAt = alertCreatedAt + regime.fiuResponseSla`. Under `cz-2026` this is **our policy**, not law — label it that way in the UI, not as a statutory deadline. |

---

## Regime configuration

Only four values differ. One config object drives the whole switch.

```ts
export type Regime = "cz-2026" | "amlr-2027"

export const REGIMES = {
  "cz-2026": {
    retentionYears: 10,
    pepApproverRoles: ["board-aml-member", "board-delegate"],
    requireHumanOnRestrictingOutcome: false,
    fiuResponseSla: { workingDays: null },   // no statutory figure — our policy
    pepTailMonths: 12,
  },
  "amlr-2027": {
    retentionYears: 5,
    pepApproverRoles: ["senior-management"],
    requireHumanOnRestrictingOutcome: true,
    fiuResponseSla: { workingDays: 5 },
    pepTailMonths: 12,
  },
} as const satisfies Record<Regime, RegimeConfig>
```

**INV-1 to INV-8, INV-10, INV-12 and INV-14 are identical under both regimes.** Build those first — they are the stable core and carry the bulk of the scoring.

---

## Where it lives

Per `CLAUDE.md` — vertical slices under `src/features/`, shared tables in `src/core/db/schema/`.

```
src/features/detection/     rules A, B, C + DETECTION constants + FX conversion
src/features/triage/        triage gates (INV-5,6,7,12), canAutoClose, priority 0-100
src/features/escalation/    roster, routing, 4-eyes (INV-8,9,11)
src/features/alerts/        alert schema + all zod refinements, the OPO export projection (INV-10)
src/features/export/        CSV writer + the validation pass
src/core/db/schema/         alerts, clients, transactions, log entries
```

Server-only members (`actions.ts`, `queries.ts`) stay out of each feature's `index.ts` barrel.

## Enforcement points

Enforce twice. The schema makes bad alerts unconstructable; the export pass proves it and produces evidence.

1. **Construction** — zod refinements on the alert row. Most invariants belong here. An alert violating INV-1, 2, 3, 4, 8 or 11 should be impossible to build.
2. **Triage gate** — runs *before* a decision is accepted (INV-5, 6, 7, 12). Never ask the model for a decision an invariant forbids; constrain the choice set first.
3. **Export pass** — re-assert every invariant over the full alert set before writing the CSV. Fail the run on violation and emit a per-invariant pass/fail summary. **This summary is the audit-log demo** (15 % of the FINREG weighting) — build it as an artefact, not a console log.

## Testing

- **Unit** (`*.test.ts`) — one case per invariant, each proving the violation is *rejected*. These are cheap and directly demonstrate compliance.
- **Integration** (`*.spec.ts`) — the detection rules against seeded fixtures, plus a full-run export pass asserting zero violations.
- Give every invariant a test named after its ID (`INV-5 forces REVIEW for a PEP client`). The test names then read as a compliance checklist.

## Known gaps — state these, do not hide them

| Gap | Status |
| --- | --- |
| Sanctions screening (the only automatic suspicion rule in Czech law) | **Unimplementable** — counterparty accounts are anonymised, no names to match |
| Source of funds | Not in the dataset — INV-6 is a degraded checklist, not the statutory prohibition |
| Beneficial ownership | Not in the dataset |
| Rule B country branch | Fires **zero times** on the July 2026 lists |
| INV-14 PEP tail | Config only, unexercised — no office-end date exists |
| Escalation matrix and conflict-of-interest rules | **Given at the briefing** — INV-9's roster is blocked until then |
