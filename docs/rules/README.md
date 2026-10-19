# Rules: the specification we iterate on

This folder is where the team designs the red-flag rules and the decisions that follow them. It is a specification, not code. The Kotlin backend implements what is written here, and a change to a rule starts here.

Background and sources live in [`../challenge/`](../challenge/README.md). This folder only cites them.

## Files

| File                                                            | What                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [TEMPLATE.md](TEMPLATE.md)                                      | Copy this to start a new rule                                             |
| [A-profile-discrepancy.md](A-profile-discrepancy.md)            | Rule A: daily volume or single transaction out of line with the profile   |
| [B-high-risk-pep.md](B-high-risk-pep.md)                        | Rule B: high-risk jurisdiction or PEP                                     |
| [C-flow-through.md](C-flow-through.md)                          | Rule C: money in and out again within hours                               |
| [D-kyc-rating-inconsistent.md](D-kyc-rating-inconsistent.md)    | Rule D (proposal): AML risk rating inconsistent with the client's facts   |
| [E-kyc-profile-implausible.md](E-kyc-profile-implausible.md)    | Rule E (proposal): declared profile implausible for the client type       |
| [F-tail-payment-context.md](F-tail-payment-context.md)          | Rule F (proposal): tail payment with a country fact                       |
| [G-unusual-corridor.md](G-unusual-corridor.md)                  | Rule G (proposal): unusual foreign corridor                               |
| [priority.md](priority.md)                                      | The 0 to 100 priority scorecard shared by every rule                      |
| [escalation.md](escalation.md)                                  | Who decides and who approves, with the conflict-of-interest checks        |
| [jev-questions.md](jev-questions.md)                            | How to write a Jev question, what Jev returns, what we log                |
| [candidates.md](candidates.md)                                  | Further red flags we considered, with the data verdict on each            |
| [data-patterns.md](../challenge/data-patterns.md)               | Data run: the generator fingerprint and the verdict on every signal tried |
| [aml-pattern-research.md](../challenge/aml-pattern-research.md) | The pattern research behind the data run and the candidates               |

## Anatomy of a rule

Every alert goes through the same seven steps. Each rule spec fills in the steps that apply to it, and each step names who decides it.

| #   | Step       | Decider       | Output                                                       |
| --- | ---------- | ------------- | ------------------------------------------------------------ |
| 1   | Detect     | Code          | The alert fires or not, per the brief's thresholds           |
| 2   | Facts      | Code          | Named, computed values: ratios, hours, shares, bands         |
| 3   | Gates      | Code          | Hard outcomes no model may override (always REVIEW, floors)  |
| 4   | Judgements | Jev           | Typed answers with probabilities, one question per judgement |
| 5   | Triage     | Code (policy) | FP or REVIEW from gates, facts, answers and thresholds       |
| 6   | Priority   | Code          | 0 to 100 from the scorecard, with its breakdown              |
| 7   | Route      | Code          | Executive role, person and approver from the matrix          |

The `reason` and `log` columns are built from steps 2 to 7. Claude Sonnet 4.5 may write a readable story on top of the log, but it decides nothing.

## Code or Jev

One test, agreed in [decision-architecture.md](../challenge/decision-architecture.md):

- **Code** when the step is a formula, a threshold or a lookup; when the brief or the law states it; when it must give the same answer every time; or when it is a hard guardrail.
- **Jev** when the step weighs soft facts that two analysts could read differently, and no formula exists. Each such step is one typed question with a written criterion.

If you can write the step as `if x > 3`, it is code. If the honest answer to "how would you decide this?" is "it depends on the client", it is a Jev question.

## How to define a rule

Two simple formats, both in the rule's spec file:

- **Parameters** (steps 1, 3, 5, 6) go in a table: name, value, unit, source, status. The status is `brief`, `law`, `default` (our choice, not yet confirmed) or `confirmed` (with who and when). The backend reads every threshold from one config with the same names, so changing a value never means changing code.
- **Judgements** (step 4) are Jev question objects in the exact shape of the API request (`type`, `instructions`, `criteria`). The fenced JSON in the spec is the contract: copy it verbatim into the backend config. [jev-questions.md](jev-questions.md) explains how to write one.

## Iterating on a rule

1. Change the spec: a threshold, a fact, a question's wording.
2. Run it on the labelled alerts (about 50 for tuning; the 25 held-out ones stay untouched until the final figure). Labelling plan: [decision-architecture.md](../challenge/decision-architecture.md#labelling-plan).
3. Record the outcome in the rule's change log: what changed, alert count, FP share, agreement with our labels, and the sample size.
4. When a mentor answers one of the rule's open questions, write the answer in [mentor-questions.md](../challenge/mentor-questions.md) and flip the parameter's status to `confirmed`.

A rule is done when every parameter is `brief`, `law` or `confirmed`, it has hand-computed test cases, and its numbers on the held-out set are in its change log.

## Status

| Rule     | Detect      | Jev              | Policy  | Tests | Open questions |
| -------- | ----------- | ---------------- | ------- | ----- | -------------- |
| A        | dry run     | draft            | draft   | none  | 5              |
| B        | dry run     | none (by design) | draft   | none  | 3              |
| C        | approximate | draft            | draft   | none  | 3              |
| D        | proposal    | draft            | draft   | none  | 2              |
| E        | proposal    | draft            | draft   | none  | 2              |
| F        | proposal    | draft            | draft   | none  | 3              |
| G        | proposal    | draft            | draft   | none  | 3              |
| Priority | n/a         | input only       | draft   | none  | 2              |
| Routing  | n/a         | none             | default | none  | 3              |
