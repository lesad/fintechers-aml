# Track 5: AML

Decided 2026-10-19 on the way to the event. The focus is AML, not fraud: it has the most impact for MoroSystems and our customers, and it shows we know the regulatory work even if we don't win. **Priority challenge (2026-10-19): FINREG's AML triage and red-flag escalation.** Why: it uses typed AI decisions, the idea behind our first lead; it builds on AML, an area of interest for Moro; and its triage and escalation workflow is a UX problem our mostly frontend team can own.

Source: https://thefintechers.notion.site/Track-5-Compliance-and-RegTech-copilots-3fc1e81998138119ae58d48c1f2656a3, read in a browser on 2026-10-19 up to the end of the ruleset. Notion renders the rest of the page lazily, so the other challenges, the CSV schema and the scoring come from the 2026-10-18 read in [challenges-2026-10-18.md](https://gitlab.com/morosystems/other/fintechers-hackathon-2026/-/blob/main/context/2-areas/hackathon/challenges-2026-10-18.md#track-5-compliance-and-regtech-copilots).

## Track at a glance (2026-10-19)

- Partners: ČNB, FINREG PARTNERS, Deloitte.
- The page recommends three challenges: FINREG's AML triage (ČNB dataset, AML crash course, CZK 40,000 legal-services prize), ČNB's regulatory-change radar ("written by the regulator", with Jan Bridzik, who also sits on the jury), and the transaction monitoring copilot (same ČNB dataset, ČNB mentors).
- Masterclasses, Mon 13:30 to 14:30: AML crash course by FINREG with ČNB experts (room 1); regulatory-change radar with Jan Bridzik (room 2, TBC).
- Mentors: Jan Bridzik (ČNB, Mon 13:00 to 14:30, Tue 07:30 to 09:00); three more ČNB mentors; Oliver Zrno (FINREG, Mon 17:00 to 19:00, Tue 09:00 to 11:00).
- Prize: CZK 40,000 in FINREG legal services to the 1st-place team, only if it worked on the FINREG challenge.

## FINREG challenge: AML transaction monitoring, triage and red-flag escalation

Updated by the organisers on 18 Oct: the ruleset compares July 2026 transactions with Q2 2026 client statistics. Introduced on stage at about 10:25.

Question (quoted): "Can an automated system save AML staff time, relay important flags to the right people and make every decision explainable, justified and auditable?"

Build (quoted): "an automated system that (i) generates red flags using the ruleset below and (ii) sorts, rates and escalates each red flag to the right person. Convert all amounts to CZK. Client volume is the sum of all of a client's transactions regardless of direction (in/out), unless the briefing says otherwise."

| Type                             | Rule (quoted)                                                                                                                                                                                                                                                                              | Alert unit                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| A, client profile discrepancy    | "Daily volume in July 2026 is greater than 25% of the projected monthly volume, or greater than 3x the average daily volume in Q2 2026; or a single transaction is greater than 2x the maximum transaction in Q2 2026. Clients inactive in Q2 2026 are compared to projected volumes only" | One alert per client      |
| B, high-risk jurisdiction or PEP | "A transaction above CZK 10,000 where the payer, payee or client country is on the EU or FATF high-risk jurisdictions list; or an outgoing transaction of a Politically Exposed Person above CZK 100,000 (where direction is unclear, any transaction)"                                    | One alert per transaction |
| C, flow-through account          | "Within 24 hours the client receives incoming payments above CZK 100,000 and within 6 hours sends out at least 80% of that amount to another account (not the payer's account). Include any further red flags you identify"                                                                | One alert per client      |

Confirmed on 2026-10-19 from the full page and the current brief (`AML_challenge.docx`); verbatim text in [finreg-challenge.md](finreg-challenge.md):

- **Output:** one CSV row per alert: `alert_id, alert_type, client_id, transaction_id, triage (FP/REVIEW), priority (0-100), executive_role, executive_person, approver (4 eyes), reason, log`. A and C alerts are one per client, B one per transaction.
- **Escalation matrix and conflict-of-interest rules are not published.** They "are given at the briefing". Get them from the stage intro (about 10:25), the AML crash course (13:30, room 1) or the FINREG mentor.
- **FINREG scoring (its prize only; the main jury ranks the top 3):** triage and priority 40%, checked on 30 to 45 sampled alerts (10 to 15 per type); escalation 20%; justification 25%; audit log, demo and solution 15%.
- **Hand-ins:** code, the CSV, a FINREG demo of at most 5 minutes, and a decision-logic write-up of at most 2 pages backed by the data.
- **Data:** `clients.csv` and `transactions.csv`, semicolon-delimited, UTF-8 with BOM, in the team's S3 bucket under `CNB/`. The high-risk country list is not supplied. The briefing may redefine "volume".
- **FINREG's tip:** use AI for decisions and for navigating the ruleset, not on every row.
- The attachment named `FinReg_AML_challenge_brief.docx` is an older version with August dates; `AML_challenge.docx` matches the page's July and Q2 dates.

## Team brief for day 1 (2026-10-19)

| File                                                 | What it answers                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [finreg-challenge.md](finreg-challenge.md)           | Full page and brief text: output CSV, scoring, hand-ins, data format                                            |
| [rule-b-reference-data.md](rule-b-reference-data.md) | EU and FATF high-risk lists for July 2026 (31 ISO codes), ČNB rate files for CZK conversion                     |
| [czech-aml-escalation.md](czech-aml-escalation.md)   | Czech AML roles, FAÚ reporting, 4-eyes, closure reasons, AI expectations, a draft escalation matrix             |
| [data-profile.md](data-profile.md)                   | The ČNB dataset as delivered: columns, values, and five findings for the build (no high-risk countries, no MCC) |
| [aws-account-setup.md](aws-account-setup.md)         | AWS profile setup, daily commands, verified access and model behaviour                                          |
| [aws-demo-guidance.md](aws-demo-guidance.md)         | AWS's flow and five demo criteria from the event, mapped to our design                                          |
| [decision-architecture.md](decision-architecture.md) | Stack, who decides what, guardrails, the labelling plan (supersedes the build shape below)                      |
| [ux-and-typed-ai.md](ux-and-typed-ai.md)             | How AML tools present triage, Bedrock models with structured output, graph libraries, the demo moment           |

**Build shape (Recommendation).**

1. Deterministic rules (now SQL, see decision-architecture.md) generate A, B and C alerts from the ČNB CSVs (semicolon-delimited, UTF-8 with BOM). Amounts in CZK from the ČNB yearly file, using the last fixing on or before the date. Load ISO codes with NA parsing off, or Namibia (`NA`) disappears.
2. The model makes typed decisions only: `triage` (FP or REVIEW), `priority` (0 to 100), reason codes and cited transaction ids, through Bedrock structured output. Code range-checks the priority and verifies every cited id. FINREG's own tip: AI for decisions and ruleset navigation, not on every row.
3. Escalation from a matrix, not from the model. Draft until the briefing gives the official one: A to an L2 analyst, auto-close only when low risk; B never auto-closes, to the AML compliance officer, PEP cases also to the board member responsible for AML; C to the contact person (kontaktní osoba) with a suspicious transaction report (OPO) to FAÚ and a hold under §20. Preparer and approver are always different people with no business-line link to the client.
4. UI: an alert queue by priority, one case view with a rule trace, evidence chips, a Cytoscape.js money-flow graph and an SVG timeline for C's 24 h in and 6 h out, then a 4-eyes sign-off and an audit export. The demo moment: hovering an evidence chip highlights the same transactions in the graph, the timeline and the rule trace.
5. Every closure states whether and why suspicion was excluded (ČNB calls a bare "OK" a deficiency). AMLA's June 2026 draft allows automated closure only for low-risk alerts with no indicators.

**Facts to get at the event.**

- The escalation matrix and conflict-of-interest rules ("given at the briefing"): stage intro at about 10:25, AML crash course at 13:30 (room 1), or the FINREG mentor.
- Whether "EU or FATF high-risk list" includes the FATF grey list (we assume yes) and whether "volume" is redefined.
- Resolved 2026-10-19: Claude Sonnet 4.5 through the EU profile is the default runtime model; gpt-oss-120b is active and stays for high-volume batch work. Haiku 4.5's EU profile fails.

**Legal facts that shape the design.**

- The OPO goes to FAÚ "without undue delay"; Czech law sets no day count. A postponed order runs no earlier than 24 h after FAÚ receives the report.
- Retention is 10 years under Czech law (5 under AMLR from July 2027).
- AML triage is not in AI Act Annex III.
- The rule that an analyst must not review a client they manage is not found in Czech or EU sources. UNVERIFIED.

## Other ideas raised by the team

- A full business audit and a compliance checklist for other companies. The closest published home is the "AI Act self-audit" challenge in this track (card I14 is related). An own idea within the track needs the track owner's approval.

## Our cards that fit

- I13 AML alert triage with a two-speed model: the FINREG challenge almost one to one.
- I07 Mule chain tracer: rule C as a clickable flow-through graph.
- I12 Regulatory change to control-gap agent: the ČNB radar.
- I14 AI Act dossier generator: the AI Act self-audit.
