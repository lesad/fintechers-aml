# Challenge context: FINREG AML triage

What the build and the pitch need to know about the hackathon challenge. This folder is the single source since 2026-10-19: edit files here. The team's research repo ([fintechers-hackathon-2026](https://gitlab.com/morosystems/other/fintechers-hackathon-2026)) is frozen and keeps the selection history, the dropped fraud lead and the pre-decision research.

## The challenge in one paragraph

Track 5, FINREG PARTNERS "AML transaction monitoring: triage and red-flag escalation" on ČNB's synthetic data. Generate red flags with rules A (client profile discrepancy), B (high-risk jurisdiction or PEP) and C (flow-through account), then sort, rate and escalate each one to the right person. Every decision must be explainable, justified and auditable. Output: one CSV row per alert (`alert_id, alert_type, client_id, transaction_id, triage, priority, executive_role, executive_person, approver, reason, log`), a FINREG demo of at most 5 minutes, and a decision-logic write-up of at most 2 pages. Code freeze: Tuesday 20 October, 13:30.

## Why this challenge

Decided 2026-10-19 on the way to the event. The focus is AML, not fraud: it has the most impact for MoroSystems and our customers, and it shows we know the regulatory work even if we don't win. FINREG's challenge uses typed AI decisions, the idea behind our first lead; it builds on AML, an area of interest for Moro; and its triage and escalation workflow is a UX problem our mostly frontend team can own.

## Files

| File                                                   | What it answers                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| [hackathon.md](hackathon.md)                           | Team, timeline, rules, judging, deliverables, open questions                                            |
| [finreg-challenge.md](finreg-challenge.md)             | Full challenge page and brief text: ruleset, output CSV, scoring, hand-ins                              |
| [finreg-kickoff.md](finreg-kickoff.md)                 | What FINREG stressed at the kickoff: scope, no self-review, ruleset maintenance duties                  |
| [app-rules.md](app-rules.md)                           | **Implementation spec:** the detection rules and the invariants the code enforces, with guidelines      |
| [company-specific-rules.md](company-specific-rules.md) | Our own 18-scenario monitoring ruleset (S-01…S-18): typology, logic, evidence status, firing rates      |
| [data-profile.md](data-profile.md)                     | The ČNB dataset as delivered, FX rates, five findings for the build, the rule dry run                   |
| [mostlyright-data.md](mostlyright-data.md)             | MostlyRight registers: contents, encoding damage, why they don't join, what matching would need         |
| [data-patterns.md](data-patterns.md)                   | What the synthetic data supports: the generator fingerprint and the verdict on every signal tried       |
| [aml-pattern-research.md](aml-pattern-research.md)     | Typologies, EU and ČNB guidance on alerts, unsupervised methods; the research behind the data run       |
| [rule-b-reference-data.md](rule-b-reference-data.md)   | EU and FATF high-risk lists for July 2026 (data in `reference/high-risk-countries-2026-07.json`)        |
| [aml-hard-rules.md](aml-hard-rules.md)                 | Legal context for the rules: EU and Czech AML hard rules today, from 10 July 2027 (AMLR), and the delta |
| [aml-legal-sources.md](aml-legal-sources.md)           | Czech, EU and guidance sources with links, mapped to rules, priority, escalation and records            |
| [czech-aml-escalation.md](czech-aml-escalation.md)     | Czech AML roles, FAÚ reporting, 4-eyes, closure reasons, a draft escalation matrix                      |
| [mentor-questions.md](mentor-questions.md)             | Questions for FINREG, ČNB and the crash course, our defaults, and the answers we get                    |
| [decision-architecture.md](decision-architecture.md)   | Stack, who decides what, guardrails, labelling plan                                                     |
| [architecture.md](architecture.md)                     | Which component does what (settled by ADR-0024 and ADR-0025); the engine's API contract is still open    |
| [ux-and-typed-ai.md](ux-and-typed-ai.md)               | AML triage UX patterns, graph libraries, the demo moment                                                |
| [aws-account-setup.md](aws-account-setup.md)           | Our AWS profile setup (`hackathon`), daily commands, verified access and model behaviour                |
| [aws-participant-guide.md](aws-participant-guide.md)   | Team AWS account: SSO sign-in, models and limits, budget, blocked services                              |
| [aws-demo-guidance.md](aws-demo-guidance.md)           | AWS's flow and five demo criteria, mapped to our design                                                 |
| [aml-triage-playbook.html](aml-triage-playbook.html)   | The AML Triage Playbook page: brief, build plan, triage logic, demo, research; open in a browser        |

## Data

`pnpm data:pull` syncs `CNB/` and `MostlyRIght/` from the shared bucket and downloads the ČNB FX fixings into `data/raw/`, which git ignores. It uses `AWS_PROFILE` (the team profile, named `hackathon` by convention) or `--profile NAME`. Sign in first with `aws sso login --profile hackathon`; setup is in [aws-participant-guide.md](aws-participant-guide.md). The organisers' data never goes into git.

## Open at the event

The questions, our defaults and the answers we get are in [mentor-questions.md](mentor-questions.md). Write each answer under its **Answer:** line with the mentor's name and the time. The five that decide the score: the escalation matrix and conflict-of-interest rules, currency conversion, which high-risk list, how triage and priority are graded, and extra red flags.
