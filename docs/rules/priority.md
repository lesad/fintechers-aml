# Priority scorecard

**Status:** draft. Every rule uses it. Priority is code: points per factor, then floors, then a range check. Jev's answers enter as factors and never set the number directly.

## Factors

The brief lists the factors: AML risk score, PEP, country, amount or volume, conduct discrepancies, length of the client relationship, how the contract was concluded, and multiple flags on the same client. All weights are defaults. If the labels allow, a regression on Jev's probabilities and these facts replaces them (TypeSafe's composite-scoring pattern), and the breakdown stays the same.

| Factor              | Points                                                                                                                                                              | Max | Input        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------ |
| AML risk score      | low 0, medium 10, high 20                                                                                                                                           | 20  | client       |
| PEP                 | 15                                                                                                                                                                  | 15  | client       |
| Country             | 10 if any party country is on the high-risk list                                                                                                                    | 10  | rule B facts |
| Amount or volume    | rule A: `czk_spike_band` normal 0, elevated 8, extreme 15. Rule B: above 1,000,000 CZK 15, above 250,000 CZK 8. Rule C: `in_sum_czk` above 1,000,000 CZK 15, else 8 | 15  | rule facts   |
| Conduct discrepancy | rule A: `15 × (1 - profile_consistent)`, rounded. Rule C: `15 × (1 - business_rationale)`. Rule B: 0                                                                | 15  | Jev          |
| Relationship length | under 1 year 10, 1 to 3 years 5, over 3 years 0                                                                                                                     | 10  | client       |
| Contract channel    | distant 5, in person 0                                                                                                                                              | 5   | client       |
| Multiple flags      | 2 rule types on the client 5, all 3 rule types 10                                                                                                                   | 10  | all alerts   |
| **Total**           |                                                                                                                                                                     | 100 |              |

### Data run

Proposals from the data run ([data-patterns.md](../challenge/data-patterns.md)), status default (data run). They are not fitted (the data has no labels) and do not replace the weights above until the team agrees. Main finding: risk score, PEP, channel, tenure and country make no difference to behaviour in this data; they score because the brief names them, not because they predict anything.

| Factor                   | Data run note                                                                                            | Proposed points (default (data run))                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AML risk score           | No behavioural difference between high, medium and low (same July count and amounts)                     | Unchanged: high 20, medium 10                                                                                         |
| PEP                      | Behaviour indistinguishable from other clients; a static attribute only                                  | Unchanged: 15                                                                                                         |
| Country                  | Zero hits on the July 2026 lists; TR and ZA on older lists give 398 transactions                         | Unchanged; live only if the list changes                                                                              |
| Amount or volume, rule A | `czk_spike_band` mostly measures FX: the CZK form of the largest payment picks EUR payments              | Raw largest payment at or above peer P95 10 (282 clients); a CZK payment above 2x the Q2 maximum 5 (702 clients)      |
| Amount or volume, rule C | Half of hits send out more than 1.5x what came in: one large unrelated outflow, not a pass-through       | Forwarded share 0.8 to 1.2: +10; above 2: −5; all outflow legs abroad: +5 (S1) or at most +3 (S8). Weights UNVERIFIED |
| Conduct discrepancy      | `profile_consistent` has no behavioural signal to learn from; the count gap is arithmetic                | Count gap percentile in the peer group: P95 and above 20, P90 to P95 12, P75 to P90 6 (exceeds the current 15 cap)    |
| Relationship length      | No behavioural difference once the Q2 baseline is prorated; scores as a named factor                     | Under 90 days 10, 90 to 365 days 5 (230 and about 626 clients)                                                        |
| Contract channel         | Only effect found: CZK share of volume 0.106 distant against 0.087 in person                             | Unchanged: distant 5                                                                                                  |
| Multiple flags           | Not computed with B and C together                                                                       | B or C on the same client 10 each, at most 20                                                                         |
| Further flags            | Near-zero balance (25 clients), night activity, foreign counterparty share carry no signal beyond chance | Near-zero balance +3 or drop; night at most 3 or drop; foreign share 0 to 5 (UNVERIFIED)                              |

On the rule A factors the data run computed (no country, no multiple flags), the proposed points give p50 10, p90 25, p99 40, max 65; under 20: 4,382 clients, 20 to 39: 1,055, 40 and above: 56. K005492 has no Q2 baseline; the score script set its percentiles to 1. Decide that explicitly in code.

## Floors

Applied after the sum. The highest floor that matches wins.

| Floor | When                                  | Source                                                                    | Status  |
| ----- | ------------------------------------- | ------------------------------------------------------------------------- | ------- |
| 90    | Rule C with `typology` `mule_pattern` | ours                                                                      | default |
| 80    | Rule C                                | [czech-aml-escalation.md](../challenge/czech-aml-escalation.md) section 6 | default |
| 80    | PEP and a high-risk country           | [decision-architecture.md](../challenge/decision-architecture.md)         | default |

Then clamp to 0 to 100 and reject anything that is not an integer.

## Bands

0 to 39 low, 40 to 69 medium, 70 to 100 high. The queue sorts by priority and shows the band, so any grading FINREG uses (exact number, band or rank) can follow it.

## Breakdown in `log`

Every alert stores each factor's points and the floor that applied, for example:

```json
{
  "risk": 10,
  "pep": 0,
  "country": 0,
  "amount": 8,
  "conduct": 11,
  "relationship": 0,
  "channel": 5,
  "flags": 0,
  "sum": 34,
  "floor": null,
  "priority": 34
}
```

## Open questions

In [mentor-questions.md](../challenge/mentor-questions.md): how priority is graded (4), and whether the further red flags in [candidates.md](candidates.md) count as factors or as alerts (5).
