# Demo script

Three decisions in the review loop: one case is not a false positive, one is a one-off false positive, and one is a false positive whose reason becomes a checked rule change that also covers the earlier one. Every id and number below was checked against the engine on 2026-10-20 (run 1, July 2026 data).

## Before the demo

- `aws sso login --profile hackathon`, then start the engine with `AWS_PROFILE=hackathon` (the AI Rating and the suggestion call Bedrock).
- The three demo transactions are `NEW`, with only the engine's routing entry in their log, and client K001809 has no draft rule `B2-K001809`.
- Sign in as the reviewer, J. Novák.

## The cast

| Step | Transaction | Client | Why it is here |
| --- | --- | --- | --- |
| 1 Escalate | TX000201101 | K005480 | Clear pass-through: new client, CZK 21.9 million in from a shared Austrian account, CZK 31.2 million out within 34 minutes. Triage: high, score 83. AI Rating: high, pass-through. |
| 2 False positive, no suggestion | TX000029968 | K001809 | PEP, CZK 145,329 to Italy. A one-off reason, so the engine proposes no rule. |
| 3 False positive, suggestion | TX000068908 | K001809 | Same PEP, CZK 290,181 remittance to Germany. A pattern reason, so the engine proposes a rule that closes this alert and the one from step 2. |

K001809 is a Czech PEP with eight B2 alerts in July, all triaged medium: seven payments to EU countries and one to South Korea (TX000222781, CZK 120,645).

## Script

### 1. Escalate (about 1 minute)

Open TX000201101. Show the money flow, the rule evidence and the AI Rating (high, pass-through). Escalate:

> New client, 38 days. CZK 21.9 million in from an Austrian account shared by 42 clients, CZK 31.2 million out within 34 minutes. Pass-through pattern; needs EDD and an MLRO decision.

The case moves to the manager, and the decision log records who, when and why.

### 2. False positive, no suggestion (about 30 seconds)

Search the queue for K001809 and open TX000029968. Mark as false positive:

> One-off payment for a holiday apartment deposit in Italy; booking confirmation on file.

The engine looks for a rule change and finds none, because a one-off is not a pattern. Only the "Marked as false positive" toast shows.

### 3. False positive with a suggestion (about 2 minutes)

Open TX000068908. Show the client card (PEP, declared CZK 255,857 a month), the evidence and the AI Rating. The rating is high, verdict PEP proceeds: its open questions ask for the source of the money and whether the other alerts look the same. The model raises the questions; the reviewer answers them from the client file.

Mark as false positive:

> The client is a domestic PEP who regularly pays suppliers and family in other EU countries. Payments to EU countries under 300,000 CZK are this client's normal pattern, confirmed in the last EDD review. Payments outside the EU still need review.

The rule suggestion opens:

- New rule `B2-K001809`, client layer, replaces B2 for this client only.
- Plain English: flags this PEP's outgoing payments above CZK 100,000 unless they go to an EU country and stay under CZK 300,000.
- Effect on this run, measured by code: closes this alert; for this client it stops 7 hits and closes 6 other alerts, all medium, and raises no new hits.

The six include TX000029968 from step 2: the rule agrees with the earlier ruling. The South Korean payment still alerts. Accept: the draft is saved, and a manager approves it before it runs.

## What to say if asked

- **Why only this client?** The engine rejects a change that would close an alert triage rated high or escalated anywhere in scope. A company-wide B2 change would close high PEP alerts of other clients.
- **Why no rule in step 2?** The model answers "none" for a one-off reason, and the engine declines a change that stops fewer than two hits.
- **Who checks the model?** Code compiles the condition, simulates rule resolution, counts the impact and rejects a suggestion that uses a number its input does not hold. A person accepts, a manager approves.
- **Is the 300,000 limit a parameter?** No. The model writes it into the condition, so a later edit changes the condition, not a named parameter.

## Known gaps

- The impact counts closed alerts by triage disposition, not by case status. "It covers the step 2 ruling" is narration until the backtest shows that split.
- Approving a rule affects the next run only; nothing re-triages, so the queue does not change on stage after the accept.
- The suggestion is a model call. If it fails, the decision is still saved and a toast says the suggestion failed; retry on TX000254885 (same client, CZK 244,488 to Slovakia) with the same reason. Seen in rehearsal on 2026-10-20 before the prompt stated CEL syntax: the model wrote `not in` and the condition check rejected it.
