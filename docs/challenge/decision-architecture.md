# Decision architecture and labelling plan

Agreed 2026-10-19 on the way to the event. Builds on [ux-and-typed-ai.md](ux-and-typed-ai.md), [czech-aml-escalation.md](czech-aml-escalation.md) and the Laya notes in [laya-verification.md](https://gitlab.com/morosystems/other/fintechers-hackathon-2026/-/blob/main/context/4-archive/i02-i06-payee-check/laya-verification.md).

## Stack

- **App:** Next.js on Vercel, from Adrian's `agentic-next-app` template (Next.js 16, strict TypeScript, Tailwind v4, shadcn/ui, zod, Vitest, Playwright). Declare it to the organisers before hacking and tag `hackathon-start` on the template baseline.
- **Backend services:** AWS, chiefly Bedrock in Frankfurt (gpt-oss-120b, fallback Claude Haiku 4.5 through the EU profile). The team account blocks IAM users and access keys ([aws-participant-guide.md](aws-participant-guide.md)), so Vercel either federates to an IAM role through OIDC or calls a small AWS backend (Lambda with a role) that calls Bedrock. gpt-oss-120b has effectively unlimited throughput; Claude models share 50 requests/min.
- **Typed decisions:** TypeSafe's Jev through its TypeScript SDK, pinned to one version. Laya is the proposed migration later, once velocity allows, behind the same request and answer shape.
- **Database:** not settled. The template ships Supabase (Postgres, Frankfurt region possible); an AWS-hosted Postgres is the alternative. Vercel functions keep no local state, so DuckDB is out as the store.
- **Batch jobs:** loading the ČNB CSVs, running rules A, B and C, and the first decision pass over all alerts run as `tsx` scripts, not in page requests. The app re-decides single alerts on demand.

## Who decides what

| Decision                                                                                                                                     | Type                         | Decider                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Rule A, B or C fired, and its facts (ratios, hours, % forwarded, matched list)                                                               | facts                        | SQL rules                                                                     |
| Activity consistent with the client's profile (client type, contract channel, country, expected volume, AML risk score; the data has no MCC) | yes/no + p                   | Jev                                                                           |
| Typology for rule C (payroll pass-through, own-account sweep, trade settlement, mule pattern, other)                                         | choice + p                   | Jev                                                                           |
| Severity 1 to 5, each level described                                                                                                        | score + p                    | Jev                                                                           |
| Triage: false positive or review                                                                                                             | choice + p                   | Jev, gated by code                                                            |
| Escalation role                                                                                                                              | choice limited to the matrix | Jev within the matrix                                                         |
| Priority 0 to 100                                                                                                                            | number                       | Logistic regression on rule facts and Jev probabilities, shown as a breakdown |
| Justification citing transaction ids                                                                                                         | text                         | gpt-oss-120b; code checks every cited id                                      |

Guardrails in code:

- A PEP alert under rule B never closes as a false positive automatically.
- Automatic closure only at low severity and high confidence (the line AMLA's June 2026 draft draws).
- If Jev and gpt-oss disagree on triage, or confidence is low, the alert goes to human review.
- Preparer and approver are always different people.
- Priority is range-checked; Bedrock schemas can't enforce numeric ranges.

The Jev request and answer shape is the internal contract, so Laya or gpt-oss can stand in without UI changes.

## Data findings (2026-10-19)

From [data-profile.md](data-profile.md):

- Rule B's country branch fires zero times: no country in the data is on the July 2026 EU or FATF lists. Only the PEP branch (23 clients) fires unless FINREG names another list. Keep the list as data, so swapping it is a config change.
- Remittances (39,715) have no payer account. They count as "direction unclear" for rule B's PEP branch and can't be matched to a payer in rule C.
- 23 currencies, all converted with the ČNB fixing on or before the transaction date.
- No MCC column; profile questions use client type, channel, country, expected volume and the AML risk score. The client's AML risk score is also a priority feature.

## Labelling plan

The ČNB data has no labels, and FINREG grades triage and priority on 30 to 45 alerts it samples. We build our own answer key.

1. After the rules run, sample about 25 alerts per rule type (about 75), spread across clients and amounts.
2. Two team members label each alert as an AML analyst would: false positive or review, severity, typology, escalation role. About a minute per alert, after the 13:30 AML crash course.
3. Both label the same 20 alerts. Disagreements mark ambiguous rules; take them to the FINREG mentor.
4. Use about 50 alerts to tune the Jev question instructions and fit the regression. Keep 25 untouched for the final accuracy figure.
5. Report agreement on the held-out set in the demo and in the 2-page decision-logic write-up.

The labelling screen is the analyst case view the demo needs, so the team builds it once.

## Open

- Jev access: keys from https://console.typesafe.ai/keys; whether signup is instant or gated, and any free credits, is not documented.
- Jev hosting region is not documented. Acceptable for synthetic data; state it in the pitch.
- Whether Vercel OIDC federation to an IAM role passes the account guardrails, or the Bedrock calls move to a Lambda.
- The database choice.
