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
