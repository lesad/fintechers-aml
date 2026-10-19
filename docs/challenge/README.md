# Challenge context: FINREG AML triage

What the build needs to know about the hackathon challenge. These files are copies from the team's context repo ([fintechers-hackathon-2026](https://gitlab.com/morosystems/other/fintechers-hackathon-2026), `context/1-projects/track5-aml/` and `context/2-areas/hackathon/`). Update them there first, then copy them here. Links to files that were not copied point at GitLab.

## The challenge in one paragraph

Track 5, FINREG PARTNERS "AML transaction monitoring: triage and red-flag escalation" on ČNB's synthetic data. Generate red flags with rules A (client profile discrepancy), B (high-risk jurisdiction or PEP) and C (flow-through account), then sort, rate and escalate each one to the right person. Every decision must be explainable, justified and auditable. Output: one CSV row per alert (`alert_id, alert_type, client_id, transaction_id, triage, priority, executive_role, executive_person, approver, reason, log`), a FINREG demo of at most 5 minutes, and a decision-logic write-up of at most 2 pages. Code freeze: Tuesday 20 October, 13:30.

## Files

| File                                                 | What it answers                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [finreg-challenge.md](finreg-challenge.md)           | Full challenge page and brief text: ruleset, output CSV, scoring, hand-ins                       |
| [data-profile.md](data-profile.md)                   | The ČNB dataset as delivered, FX rates, and five findings for the build                          |
| [decision-architecture.md](decision-architecture.md) | Stack, who decides what, guardrails, labelling plan                                              |
| [rule-b-reference-data.md](rule-b-reference-data.md) | EU and FATF high-risk lists for July 2026 (data in `reference/high-risk-countries-2026-07.json`) |
| [czech-aml-escalation.md](czech-aml-escalation.md)   | Czech AML roles, FAÚ reporting, 4-eyes, closure reasons, a draft escalation matrix               |
| [ux-and-typed-ai.md](ux-and-typed-ai.md)             | AML triage UX patterns, Bedrock models with structured output, graph libraries                   |
| [aws-account-setup.md](aws-account-setup.md)         | Our AWS profile setup (`hackathon`), daily commands, verified access and model behaviour         |
| [aws-participant-guide.md](aws-participant-guide.md) | Team AWS account: SSO sign-in, models and limits, budget, blocked services                       |
| [aws-demo-guidance.md](aws-demo-guidance.md)         | AWS's flow and five demo criteria, mapped to our design                                          |
| [lane-overview.md](lane-overview.md)                 | The lane README from the context repo, with the day-1 team brief                                 |

## Data

`pnpm data:pull` syncs `CNB/` and `MostlyRIght/` from the shared bucket and downloads the ČNB FX fixings into `data/raw/`, which git ignores. It uses `AWS_PROFILE` (the team profile, named `hackathon` by convention) or `--profile NAME`. Sign in first with `aws sso login --profile hackathon`; setup is in [aws-participant-guide.md](aws-participant-guide.md). The organisers' data never goes into git.

## Open at the event

- The escalation matrix and conflict-of-interest rules ("given at the briefing").
- Which high-risk list FINREG means: no country in the data is on the July 2026 lists.
- Whether "expected volume at contract" is monthly, and the day count for the Q2 daily average.
- Jev access and hosting region.
