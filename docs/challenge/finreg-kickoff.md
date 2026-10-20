# FINREG kickoff slides: what matters for the build

FINREG presented the challenge on 2026-10-19. This file keeps only what shapes our solution. The brief itself is in [finreg-challenge.md](finreg-challenge.md); the legal sources on the slides are all in [aml-legal-sources.md](aml-legal-sources.md).

## Scope

FINREG's control loop is Risk, Detect, Review, Escalate, Audit. The slide marks **Review (filter false positives), Escalate (to the right person) and Audit (traceable actions)** as the hackathon challenge scope. Risk and Detect are inputs we still need, but the score sits on the last three. Frame the demo around them.

## What they stressed

- **Only material flags reach a human.** Meaningless alerts divert attention from the important ones. The false-positive filter is the point, not a side feature.
- **No self-review.** Never escalate to someone reviewing their own clients or their own decisions; nobody supervises their own decisions. Said twice in the deck, so the assignee and approver logic has to enforce it visibly.
- **Every decision is logged with its reasoning.** Who, when, why. No red flag is decided without a decision log. The person resolving an escalated flag justifies the decision too.
- **Context matters.** A seemingly low-risk flag can turn significant once other client information is added. Priority uses client behaviour and all available client information.
- **See the whole story.** Look for patterns across the client, not isolated transactions; several flags on the same client raise priority.
- **Justify every rule and align it with internal risk scoring.**

## Ruleset slide

The slide "Red flag identification ruleset" gives each rule a purpose (verbatim):

| Rule | Purpose |
| --- | --- |
| A, client profile discrepancy | Most alerts, highest false-positive share — tests triage against the client profile |
| B, high-risk jurisdiction or PEP | Few alerts, high severity — tests prioritisation and escalation to the right level |
| C, flow-through account | Typical mule pattern — tests intraday flows and combining risk factors |

Its footer: "Should you identify further red flags, include them as well. Recommendation: use AI for decision-making and ruleset navigation, not for analysing every row of data."

## Ruleset maintenance

The deck lists three duties beyond single-alert triage. They map to features we can show:

| FINREG duty | What we can show |
| --- | --- |
| Ensure supervision of flag resolution | The approver (4 eyes) and a supervisor view of resolved flags |
| Periodically verify that red flags are identified correctly | Sampling of closed false positives; threshold tests ([aml-pattern-research.md](aml-pattern-research.md)) |
| Periodically assess whether the ruleset captures all relevant flags | Rule proposals drafted by the model and validated in code (ADR-0032) |
