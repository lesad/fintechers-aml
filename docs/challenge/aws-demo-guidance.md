# AWS guidance for agent flows and demos

From an AWS tech presentation at the event, 2026-10-19, noted by Adrian. Paraphrased from his notes; no slides or recording in the repo.

## Agent flow

request → evidence → decide → document

## What makes a strong demo

1. Math in code: calculations are deterministic code, not the model.
2. Measured: show numbers, such as accuracy or agreement, not one happy-path example.
3. Real actions: the system does something (escalates, closes, assigns), not only chats.
4. Guardrail shown: a guardrail visibly stops or changes a decision on screen.
5. Explained and logged: every decision has a reason and lands in an audit log.

## How the AML build maps to it (Recommendation)

| AWS point            | Track 5 AML design ([decision-architecture.md](decision-architecture.md))                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Request              | An alert from rules A, B or C                                                                                                      |
| Evidence             | The rule facts and the transactions they cite                                                                                      |
| Decide               | Jev typed answers; gpt-oss second opinion; regression for priority                                                                 |
| Document             | Justification citing transaction ids, the CSV row, the audit log                                                                   |
| Math in code         | SQL rules, CZK conversion, priority formula, range checks                                                                          |
| Measured             | Agreement with our labelled hold-out set                                                                                           |
| Real actions         | Escalation to a role, 4-eyes approval, closure                                                                                     |
| Guardrail shown      | Automated Reasoning check returning INVALID, for example on a PEP alert triaged as a false positive; code blocks automatic closure |
| Explained and logged | Reason per alert, exportable audit record                                                                                          |
