# The hackathon: team, timeline, rules, judging

The FinTechers Hackathon, 19 to 20 October 2026, National House Vinohrady, Prague. Sources: https://thefintechers.com/hackathon, https://thefintechers.com/rules.pdf (last updated 2026-10-12), the Notion hackers guide and the Track 5 page. How we got here (the fraud lead, the team meeting, the switch to AML) is in the frozen context repo: [selection-history.md](https://gitlab.com/morosystems/other/fintechers-hackathon-2026/-/blob/main/context/4-archive/selection-history.md).

## Team

- Adrian Lestinsky: medior/senior frontend, context engineer
- Andrej Culen: medior/senior frontend
- Jan Bartl: frontend architect, team leader
- Martin Dulak: full-stack architect, DevOps, team leader

The team leans to frontend, so the UX of the triage workflow is our edge. Nobody is an AML analyst; the 13:30 AML crash course and the FINREG mentor fill that gap.

## What we build (decided 2026-10-19)

- **Track 5, Compliance and RegTech copilots.** Can't be switched after registration.
- **Challenge: FINREG PARTNERS "AML transaction monitoring: triage and red-flag escalation"** on ČNB's synthetic data. Generate red flags from rules A, B and C, then sort, rate and escalate each one to the right person, with every decision explainable, justified and auditable. Full text in [finreg-challenge.md](finreg-challenge.md).
- **Why:** typed AI decisions (our first lead's core idea), AML as an area of interest for Moro and its customers, and a triage workflow our frontend-heavy team can make excellent. Even without a win, it shows we know the regulatory work.
- **Stack:** runs locally, no deployment. a client-only Vite + React SPA in `frontend/` and a Kotlin + Spring Boot engine in `engine/` that owns the rules and the Postgres database (ADR-0024, ADR-0025; [architecture.md](architecture.md)); Bedrock in Frankfurt for models; TypeSafe's Jev for typed decisions, with Laya as a later migration; Claude Sonnet 4.5 (EU profile) as the default model for runtime generated text, never for decisions ([decision-architecture.md](decision-architecture.md)). The AWS team account allows no access keys, so local code uses `aws sso login` credentials ([aws-account-setup.md](aws-account-setup.md)).

## Timeline

- Day 1: 10:00 briefing (FINREG challenge at about 10:25); 10:30 tech onboarding; 11:00 to 12:00 team formation and track application; 12:00 hacking starts; 12:00 to 13:30 AWS Toolbox (mandatory); 13:30 AML crash course (room 1); 17:00 to 19:00 mentor office hours.
- Day 2: 09:00 to 11:00 office hours; 13:30 code freeze and repo submission; 13:30 to 15:00 pitch prep; 15:00 to 17:00 demos; 17:30 winners.
- Track 5 mentors: Jan Bridzik (ČNB, also on the jury; Mon 13:00 to 14:30, Tue 07:30 to 09:00), three more ČNB mentors, Oliver Zrno (FINREG; Mon 17:00 to 19:00, Tue 09:00 to 11:00). Call them through Circle. The questions to bring are in [mentor-questions.md](mentor-questions.md).

## Rules

- Existing code (own or open source) is allowed if declared in advance by replying to the organisers' instruction email. Mark the start with a `hackathon-start` tag, add a "Built during the hackathon" README section, and open the demo with one line on what existed before. Only work after the marker is judged; a technical judge reviews commit history.
- Synthetic data only. No real personal data, no production systems, no cloning of real voices or faces.
- Any LLM, model or tool is allowed. AI assistance is expected; disclose it.
- Submit the repo link before the 13:30 code freeze on Tuesday; a private repo is fine if judges have access. AWS accounts freeze after the event, so keep code in a repo we own.

## Judging

Each judge scores 1 to 5 per criterion; staff average the weighted scores. Eight jurors: Deloitte (2), Komerční banka, Mastercard, AWS, ČNB, Partners Banka, Elevator Ventures.

| Criterion                        | Weight | Judge's question                                                           |
| -------------------------------- | ------ | -------------------------------------------------------------------------- |
| Impact and relevance             | 25%    | Does it solve a real financial-services problem, on the track you chose?   |
| Technical execution              | 25%    | Does it work, and is gen AI doing real work inside it?                     |
| Innovation, beyond a GPT wrapper | 20%    | Is it more than a thin GPT wrapper?                                        |
| Responsible AI and compliance    | 15%    | Could you explain it, handle its data safely and defend it to a regulator? |
| Business viability and pitch     | 15%    | Would anyone pay for it, and did you make the case?                        |

FINREG scores its own prize separately: triage and priority 40% (30 to 45 sampled alerts), escalation 20%, justification 25%, audit log, demo and solution 15%. Prize: CZK 40,000 in FINREG legal services if the first-place team worked on this challenge.

## Deliverables

- Main: a 4-minute live demo plus 3 minutes of questions. Prizes EUR 3,500, 1,500 and 1,000.
- FINREG: the alert CSV, a demo of at most 5 minutes, and a decision-logic write-up of at most 2 pages backed by the data.
- AWS's demo advice: request, evidence, decide, document; math in code, measured, real actions, guardrail shown, explained and logged ([aws-demo-guidance.md](aws-demo-guidance.md)).

## For the pitch

- ČNB's public line on AI in supervision is that human accountability stays. Show the person who signs off.
- "Defend it to a regulator" means naming the rule each decision maps to; [aml-legal-sources.md](aml-legal-sources.md) has the citations.
- FINREG PARTNERS is a Prague law firm with a fintech practice, so its prize is legal services and its grading follows the brief's four points.

## Open questions

- The escalation matrix and conflict-of-interest rules, which high-risk list, the period of the expected volume and the Q2 day count: our defaults and the answers we get are in [mentor-questions.md](mentor-questions.md).
- Jev access (signup may be gated) and its hosting region.
- The API contract between the SPA and the engine ([architecture.md](architecture.md)); the Kotlin stack and the database are settled (ADR-0024).
- IP terms for Enterprise teams.
- Judges' access to this private repo before the 13:30 code freeze.
