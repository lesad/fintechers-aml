# Decision architecture and labelling plan

Agreed 2026-10-19 on the way to the event. Builds on [ux-and-typed-ai.md](ux-and-typed-ai.md), [czech-aml-escalation.md](czech-aml-escalation.md) and the Laya notes in [laya-verification.md](../../4-archive/i02-i06-payee-check/laya-verification.md).

## Stack

- **App:** Next.js, from Adrian's `agentic-next-app` template (Next.js 16, strict TypeScript, Tailwind v4, shadcn/ui, zod, Vitest, Playwright). Declare it to the organisers before hacking and tag `hackathon-start` on the template baseline.
- **No deployment (decided 2026-10-19):** everything runs locally on a team laptop, for the build and for the demo. Vercel is dropped.
- **Split between Next.js and Kotlin (decided 2026-10-19):** Next.js does the UI and light data reads. A simple Kotlin backend does the heavy and business-critical work: loading the CSVs, rules A, B and C, the code-side decisions and gates, priority, escalation, the batch decision pass and the audit log. Model calls (Bedrock, Jev) sit in the Kotlin backend too; that placement is assumed, not yet confirmed.
- **Backend services:** AWS, chiefly Bedrock in Frankfurt. Claude Sonnet 4.5 (`eu.anthropic.claude-sonnet-4-5-20250929-v1:0`) is the default model for all runtime generative AI (decided 2026-10-19; we have credits for the 4.5 models). gpt-oss-120b stays available for high-volume batch work. The team account blocks IAM users and access keys ([aws-participant-guide.md](../../2-areas/hackathon/aws-participant-guide.md)), so local code takes temporary credentials from `AWS_PROFILE` through `aws sso login`. The session lasts 12 hours, so sign in again before the Tuesday demo. gpt-oss-120b has effectively unlimited throughput; Claude models share 50 requests/min.
- **Typed decisions:** TypeSafe's Jev. There is no Kotlin SDK, so the Kotlin backend calls its HTTP API directly; the TypeScript SDK stays an option if Jev calls end up in Next.js. Laya is the proposed migration later, once velocity allows, behind the same request and answer shape.
- **Database:** not settled. The template ships Supabase (Postgres, Frankfurt region possible); an AWS-hosted Postgres is the alternative. Without Vercel, a local store works too: Postgres in Docker, or DuckDB, which also suits running the rules.
- **Batch jobs:** loading the ČNB CSVs, running rules A, B and C, and the first decision pass over all alerts run in the Kotlin backend, not in page requests. The app re-decides single alerts on demand through the same backend.

## Who decides what

Split agreed 2026-10-19, narrowed the same day. One test decides where each step goes:

- **Kotlin code** when the step can be written as a formula, a threshold or a lookup: the brief or the law states it, the answer must be the same every time, or it is a hard guardrail.
- **Jev** when the step needs judgement: weighing soft facts that two analysts could read differently, with no formula. Each such step is one typed question with a written criterion.
- **A general LLM** (Claude Sonnet 4.5) only writes text and never decides.

Jev sits in two places. Everything else is Kotlin.

| Step                                                                                                                                                                                                                         | Type       | Decider           | Why                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Load the CSVs, convert to CZK                                                                                                                                                                                                | facts      | Kotlin            | Formula; ČNB rate of the day, as in Act §54(3) ([aml-legal-sources.md](aml-legal-sources.md))                                                                                  |
| Rule A, B or C fired, and its facts (ratios, hours, % forwarded, matched list)                                                                                                                                               | facts      | Kotlin            | The brief gives exact thresholds                                                                                                                                               |
| Hard triage gates: rule B PEP, rule C and high AML risk score are always REVIEW                                                                                                                                              | FP/REVIEW  | Kotlin            | Written rules; no source allows auto-closing these                                                                                                                             |
| **Rule A triage for alerts the gates leave open:** is the activity consistent with the client's profile (client type, contract channel, relationship length, country, expected volume, AML risk score; the data has no MCC)? | yes/no + p | **Jev**           | The judgement call: soft factors and mitigators such as a long-standing clean client (EBA 9.7(a))                                                                              |
| **Rule C typology:** payroll pass-through, own-account sweep, trade settlement, mule pattern, other                                                                                                                          | choice + p | **Jev**           | Same pattern, different stories; no formula separates them                                                                                                                     |
| Priority 0 to 100                                                                                                                                                                                                            | number     | Kotlin scorecard  | The brief lists the factors; each scores points, Jev's probability is one factor, hard floors apply, shown as a breakdown; the regression replaces the weights if labels allow |
| Escalation role, person and approver                                                                                                                                                                                         | lookup     | Kotlin            | FINREG's matrix plus conflict-of-interest checks, graded against that matrix (20%); Jev only if the matrix has a fuzzy clause such as "if material"                            |
| Justification (`reason`)                                                                                                                                                                                                     | text       | Kotlin template   | Filled from the rule facts and each Jev answer with its criterion; code checks every cited transaction id                                                                      |
| Audit log                                                                                                                                                                                                                    | record     | Kotlin            | Decree §18(3) fields: who, when, result, inputs, reasons                                                                                                                       |
| Case story and daily digest in the UI                                                                                                                                                                                        | text       | Claude Sonnet 4.5 | Reads the log, decides nothing (see below)                                                                                                                                     |

Dropped from the first split: severity as its own Jev question (it goes into the priority scorecard) and Jev on rule B (the country branch fires zero times and PEP alerts are always REVIEW). Rule A carries the volume (5,493 alerts) and the triage grading (40%), so the one rule A question is where Jev earns its place. If Jev access fails, Sonnet 4.5 with a forced tool call answers the same two questions in the same shape.

For the pitch: rules find the alerts, the model brings judgement to the cases rules can't settle, and a person confirms.

Hard rules in code:

- Rule B PEP and rule C alerts never close as a false positive automatically.
- Hard priority floors, for example PEP plus a high-risk country is at least 80.
- Automatic closure only for low-risk alerts with no other flags and high Jev confidence (the line AMLA's June 2026 draft draws), and a person verifies it afterwards (ČNB benchmark 2/2023).
- If Jev's confidence is low, the alert goes to human review.
- Preparer and approver are always different people.
- Priority is range-checked.

The Jev request and answer shape is the internal contract, so Laya or Claude Sonnet 4.5 can stand in without UI changes. Every Jev call logs its version, the questions sent and the answers with probabilities.

Why Jev over a general LLM: each answer is a typed choice or score with a probability, tied to a written criterion, so a decision can be explained and replayed without trusting free text. That is the "beyond a GPT wrapper" and responsible-AI case for the jury.

**Audit log summary, the first general-LLM use.** Banks want everything logged, but a full log of rule facts, Jev questions, probabilities and approvals is unreadable for a person. The log stays the record. Claude Sonnet 4.5 writes the readable layer on top: a per-alert story ("why this alert ended here") and a per-run or per-day digest (alerts by rule, share closed by code vs Jev, overrides, low-confidence cases). Each sentence cites the log entry ids it rests on, and code rejects a summary that cites an id not in the log. The summary is itself logged with the model version and prompt hash, and it never changes a decision.

## Model and service choices (2026-10-19)

**Jev (TypeSafe), the decider.**

- Hosted API, `POST https://api.typesafe.ai/v1/systemone`; SDKs for Python and TypeScript (`@typesafe-ai/sdk`), none for Kotlin. Keys from https://console.typesafe.ai/keys.
- Question types: `choice`, `score`, `noul` (yes/no with a probability), each defined by `instructions` and `criteria`. Many questions in one request barely change latency.
- Price: USD 42 per billion input tokens (USD 0.042 per million); output is free. Negligible for us.
- Versions: `jev-latest` is 1.13.0, `jev-preview` is 1.14.0 (from 14 October). Pin one; answers can change between releases.
- No fine-tuning: "Jev is not fine-tuned or LoRA-adapted with customer data." Customise through instructions and criteria; TypeSafe's cookbook trains a classical model on top of Jev's probabilities, which is our priority regression.
- English gives the best accuracy. Calibration is a vendor claim. Region and data retention are not documented.
- Access risk: third-party sources (2026-10-13) describe Jev as early access with a waitlist since 15 September, US-hosted. If no key arrives, Claude Sonnet 4.5 with a forced tool call is the fallback decider (not yet tested; the same pattern works on gpt-oss-120b, see [aws-account-setup.md](../../2-areas/hackathon/aws-account-setup.md)), then Laya. Sonnet 4.5 allows 50 requests/min for the whole team, so if the batch decision pass over all alerts hits that limit, that pass runs on gpt-oss-120b.

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

The data has no labels, so accuracy needs our own answer key from the labelling plan below. It fails if labelling gets squeezed out by UI work, labellers disagree too much, labellers see the AI's answer first, the held-out set is used for tuning, the sample is too small to mean much, or our labels drift from FINREG's judgement. Mitigations: a named owner and a fixed slot after the 13:30 crash course, a spreadsheet if the UI isn't ready, hiding the AI's answers, freezing the 25 held-out alerts first, having the FINREG mentor check 5 to 10 labels at the 17:00 office hours, and always stating the sample size. Fallback measures without labels: rule unit tests on hand-computed cases, alert counts per rule, the share closed automatically, and Automated Reasoning INVALID counts.

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
- The Kotlin stack (Spring Boot or Ktor) and the API contract between Next.js and the backend.
- The database choice.
