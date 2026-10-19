# Rule X: name

**Status:** draft | dry run | tuned | done. **Owner:** role or name. **Alert unit:** one per client | one per transaction.

## Source

The rule text exactly as the brief states it, quoted from [finreg-challenge.md](../challenge/finreg-challenge.md).

## 1. Detect (code)

How the rule fires, written so two people would implement it the same way. Define every term the brief leaves open (windows, day counts, "another account").

| Parameter | Value | Unit | Source | Status |
| --------- | ----- | ---- | ------ | ------ |
| `x_name`  |       |      |        | brief  |

## 2. Facts (code)

The named values code computes for each alert. They feed the gates, the Jev state, the priority scorecard, `reason` and `log`. Give each a unit. Where Jev reads a number, also give a band computed in code (Jev is not a calculator).

| Fact | Meaning | Unit or band |
| ---- | ------- | ------------ |

## 3. Gates (code)

Outcomes no model may override, each with its basis.

## 4. Judgements (Jev)

One fenced JSON block per question, in the API's `questions` shape. Say which facts go into `state`. Write "none" and why if the rule needs no judgement.

## 5. Triage policy (code)

From gates, facts and answers to FP or REVIEW. Thresholds as parameters.

## 6. Priority

The rule's inputs to [priority.md](priority.md), and any floor it sets.

## 7. Route

The row of [escalation.md](escalation.md) that applies.

## Reason template

The `reason` text with placeholders for facts and answers. It always names the threshold, the actual value and the deciding factor (a bare "OK" fails a ČNB inspection).

## Test cases

Hand-computed inputs with the expected detect result, triage and priority floor. These become the backend's unit tests.

| Case | Input | Expected |
| ---- | ----- | -------- |

## Open questions

Links to the entries in [mentor-questions.md](../challenge/mentor-questions.md).

## Change log

| Date | Change | Alerts | FP share | Agreement (n) |
| ---- | ------ | ------ | -------- | ------------- |
