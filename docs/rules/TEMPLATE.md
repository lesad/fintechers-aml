# Alert type X: name

**Status:** draft | tuned | done. **Owner:** role or name. **Alert unit:** one per client per run | one per transaction.

## Source

The brief's text for this alert type, quoted from [finreg-challenge.md](../challenge/finreg-challenge.md).

## 1. Seed rules (engine)

One line per seed rule: key, grain, what it tests in words, link to the migration. No CEL and no parameter values here; the engine is the source.

| Rule | Grain | Tests |
| ---- | ----- | ----- |

## 2. Interpretation decisions

Every term the brief leaves open, with the reading the seed rules follow and its status (`brief`, `law`, `company`, `confirmed` with who and when).

| Decision | Reading | Status |
| -------- | ------- | ------ |

## 3. Evidence contract and `llm_context`

What every rule of this type must put in its evidence, so triage can read a rule added later. Then what `llm_context` adds for the summary.

| Field | Meaning | In evidence or `llm_context` |
| ----- | ------- | ---------------------------- |

## 4. Guardrails

Hard outcomes no score overrides, each with its basis and origin.

| Guardrail | Effect | Basis |
| --------- | ------ | ----- |

## 5. Triage policy

From the guardrails, the evidence contract and the client's fields to `FP` or `REVIEW`. No rule keys, no model. Thresholds are named parameters of the second layer.

## 6. Priority and route

The inputs to [priority.md](priority.md), any floor, and the row of [escalation.md](escalation.md).

## Reason template

The `reason` text with placeholders. It always names the rule key, the threshold, the actual value and the deciding guardrail or policy line (a bare "OK" fails a ČNB inspection).

## Test cases

Hand-computed inputs with the expected result. Detection rows are pinned by `engine/.../run/RuleAcceptanceTest.kt`; keep them in step.

| Case | Input | Expected |
| ---- | ----- | -------- |

## Open questions

Links to [mentor-questions.md](../challenge/mentor-questions.md).

## Change log

| Date | Change | Alerts | FP share | Agreement (n) |
| ---- | ------ | ------ | -------- | ------------- |
