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

## Model and service choices (2026-10-19)

**Jev (TypeSafe), the decider.**

- Hosted API, `POST https://api.typesafe.ai/v1/systemone`; SDKs for Python and TypeScript (`@typesafe-ai/sdk`), none for Kotlin. Keys from https://console.typesafe.ai/keys.
- Question types: `choice`, `score`, `noul` (yes/no with a probability), each defined by `instructions` and `criteria`. Many questions in one request barely change latency.
- Price: USD 42 per billion input tokens (USD 0.042 per million); output is free. Negligible for us.
- Versions: `jev-latest` is 1.13.0, `jev-preview` is 1.14.0 (from 14 October). Pin one; answers can change between releases.
- No fine-tuning: "Jev is not fine-tuned or LoRA-adapted with customer data." Customise through instructions and criteria; TypeSafe's cookbook trains a classical model on top of Jev's probabilities, which is our priority regression.
- English gives the best accuracy. Calibration is a vendor claim. Region and data retention are not documented.
- Access risk: third-party sources (2026-10-13) describe Jev as early access with a waitlist since 15 September, US-hosted. If no key arrives, gpt-oss-120b with a forced tool call is the tested fallback decider (see [aws-account-setup.md](aws-account-setup.md)), then Laya.

**Laya, the later migration.** Out of the box it scores 0.36 on new typed decisions (below the majority class), against Jev's 0.727; both figures come from Laya's own README. It needs a trained head or fine-tune on our labels. It runs on CPU (about 0.2 to 0.5 s per request), and the account allows only CPU instances (m6i.xlarge and m7g.xlarge are the largest), so self-hosting stays possible.

**Bedrock and AgentCore.**

| Feature                                       | Verdict                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated Reasoning checks (Guardrails)       | Use. Encode the ruleset and escalation matrix as a policy; every decision gets a VALID or INVALID finding in the audit log. This is the "guardrail shown" moment. Authoring takes learning, and checks read English only. |
| Knowledge Bases                               | Skip. The legal sources are small enough for the prompt with caching; OpenSearch Serverless costs about USD 23 a day even idle.                                                                                           |
| A Bedrock System 1 model                      | None exists. Structured output gives the format, not calibrated probabilities.                                                                                                                                            |
| AgentCore Policy                              | Optional, only if we build an agent with tools (block closing a PEP alert or self-approval).                                                                                                                              |
| AgentCore Runtime, Observability, Evaluations | Skip; not needed for a Next.js app with direct Bedrock calls.                                                                                                                                                             |

## Risks to "measured"

The data has no labels, so accuracy needs our own answer key from the labelling plan below. It fails if labelling gets squeezed out by UI work, labellers disagree too much, labellers see the AI's answer first, the held-out set is used for tuning, the sample is too small to mean much, or our labels drift from FINREG's judgement. Mitigations: a named owner and a fixed slot after the 13:30 crash course, a spreadsheet if the UI isn't ready, hiding the AI's answers, freezing the 25 held-out alerts first, having the FINREG mentor check 5 to 10 labels at the 17:00 office hours, and always stating the sample size. Fallback measures without labels: rule unit tests on hand-computed cases, alert counts per rule, the share closed automatically, Jev and gpt-oss agreement, and Automated Reasoning INVALID counts.

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
