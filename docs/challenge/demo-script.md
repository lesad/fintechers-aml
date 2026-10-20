# Demo script

The 4-minute walk through the review loop: triage basics, then a reviewer's false-positive reason turned into a checked rule change. Every id and number below was checked against the engine on 2026-10-20 (run 1, July 2026 data). The suggestion came back the same way in three of three calls.

## Before the demo

- `aws sso login --profile hackathon`, then start the engine with `AWS_PROFILE=hackathon` (the AI Rating and the suggestion call Bedrock).
- The dev database holds test decisions and drafts from 19 October (`A2-K002484`, `B2-K001765`, `C1-K002005`, pending `C1-K003129`, a few FP and escalated cases). None of them touch the demo clients, but they show on the rules page. Reset the data and rerun, or delete the drafts, before going on stage.
- Check that client K001809 has no draft rule `B2-K001809` and that its eight B alerts are `NEW`.
- Open each demo transaction once so its AI Rating is stored and loads at once. Leave TX000068908 for last if you want the rating to generate live.
- Sign in as the reviewer.

## The cast

| Step | Transaction | Client | Why it is here |
| --- | --- | --- | --- |
| 1 Escalate | TX000201101 | K005480 | Clear pass-through: new client, CZK 21.9 million in from a shared Austrian account, CZK 31.2 million out within 34 minutes. Triage: high, score 83. AI Rating: high, pass-through. |
| 2 False positive | TX000029968 | K001809 | PEP, CZK 145,329 to Italy. One-off reason, so no rule change. |
| 3 False positive | TX000053148 | K001809 | Same PEP, CZK 288,386 to Slovakia. One-off reason, so no rule change. |
| 4 MVP | TX000068908 | K001809 | Same PEP, CZK 290,181 remittance to Germany. The pattern reason gets a rule suggestion. |

K001809 is a Czech PEP with eight B2 alerts in July, all triaged medium: seven payments to EU countries and one to South Korea (TX000222781, CZK 120,645).

## Script

### 1. The queue (0:00 to 0:30)

Open the review queue. Point at the three ratings, the rule keys on each row and the counts. "Code detected and triaged these; nothing here came from a model."

### 2. Escalate (0:30 to 1:15)

Open TX000201101. Show the money flow and the rule evidence. The AI Rating card agrees: high, pass-through. Escalate with:

> New client, 38 days. CZK 21.9 million in from an Austrian account shared by 42 clients, CZK 31.2 million out within 34 minutes. Pass-through pattern; needs EDD and an MLRO decision.

The case moves to the manager and the decision log gets the entry.

### 3. Two quick false positives (1:15 to 2:00)

Search the queue for K001809. Open TX000029968, mark as false positive:

> One-off payment for a holiday apartment deposit in Italy; booking confirmation on file.

Open TX000053148, mark as false positive:

> One-off tuition fee for the client's daughter at a university in Bratislava; invoice on file.

Both times the engine checks for a rule change and finds none, because a one-off is not a pattern. Only the "Marked as false positive" toast shows. Say it out loud: "it does not invent rules from one-offs."

### 4. The MVP (2:00 to 3:30)

Open TX000068908. Show the client card (PEP, declared CZK 255,857 a month) and the rule evidence. Wait for the AI Rating.

The rating is high, verdict PEP proceeds: the payment is 9.5 times the client's Q2 maximum, and the client has seven other B alerts. Its open questions ask for the source of the money and whether the other alerts look the same. That is the point to make: the model raises the questions, and the reviewer answers them from the client file. It does not decide.

Mark as false positive:

> The client is a domestic PEP who regularly pays suppliers and family in other EU countries. Payments to EU countries under 300,000 CZK are this client's normal pattern, confirmed in the last EDD review. Payments outside the EU still need review.

The rule suggestion opens:

- New rule `B2-K001809`, client layer, replaces B2 for this client only.
- Plain English: flags this PEP's outgoing payments above CZK 100,000 unless they go to an EU country and stay under CZK 300,000.
- Effect on this run, measured by code: closes this alert; for this client it stops 7 hits and closes 6 other alerts, all medium. It raises no new hits.

Say what is left open: the South Korean payment still alerts. Two of the six closed alerts are the ones closed by hand a minute ago, so the rule agrees with the reviewer's own rulings.

Accept. The draft is saved; a manager has to approve it before it runs (4-eyes).

### 5. Backtest (3:30 to 4:00, when built)

Open the draft on the rules page and run the backtest against the current B2. Show the diff: alerts the new version drops, split into ones already ruled false positive (2), open ones it would close (4), and none that were escalated or rated high. If the backtest is not ready, say the impact numbers above are the same comparison, measured before the accept.

## What to say if asked

- **Why only this client?** The engine rejects a change that would close an alert triage rated high or escalated anywhere in scope. A company-wide B2 change would close high PEP alerts of other clients, so only a client-layer change passes.
- **Why no rule from the first two?** The engine declines a change that stops fewer than two hits, and the model answers "none" for a one-off reason.
- **Who checks the model?** Code compiles the condition, simulates rule resolution, counts the impact and rejects a suggestion that uses a number its input does not hold. A person accepts, a manager approves.
- **Is the 300,000 limit a parameter?** No. The model writes it into the condition, so a later edit changes the condition, not a named parameter.

## Known gaps

- Today the impact counts closed alerts by triage disposition, not by case status. "Two of them you already ruled" is narration until the backtest shows the split.
- Approving a rule affects the next run only; nothing re-triages, so the queue does not change on stage after the accept.
- The suggestion is a model call. If it fails on stage, the decision is still saved and a toast says the suggestion failed; retry from another K001809 alert with the same reason (TX000254885, CZK 244,488 to Slovakia, gives the same suggestion). Seen in rehearsal on 2026-10-20: the model wrote `not in`, which is not CEL, and the condition check rejected it.
