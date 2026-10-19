# Design brief, step 2: transaction detail

Brief for Claude Design. Builds on step 1 (the review overview with tabs). This step: **the content of one detail tab, one variant, basic form.** Same look and feel as step 1: data-dense, tight spacing, colour only for risk.

## What the reviewer needs on one screen

1. **Header:** transaction id, amount in CZK (original currency and amount in small text), date and time, direction (incoming, outgoing, or remittance = unknown), client id, status, time since flagged.
2. **The two ratings, side by side:**
   - Rule rating (leads): Low / Medium / High, one-line reason, and the rule that fired with threshold vs actual value (e.g. "PEP outgoing payment: limit 100,000 CZK, actual 184,500 CZK").
   - AI rating (secondary, labelled AI): Low / Medium / High, a short summary of 2 to 3 sentences.
3. **Money flow:** one simple diagram, left to right: payer → client's account → payee, for this transaction and the client's other transactions that day. Line width by amount; the flagged transaction highlighted.
4. **Client:** country, type (natural person, entrepreneur, legal entity), contract date and channel (in person or distant), PEP yes/no, AML risk score (low/medium/high), expected monthly volume vs real Q2 volume.
5. **Client's other transactions:** a compact list of the client's recent transactions, the flagged one highlighted.
6. **Decision:** two buttons, Close and Escalate, each with a required reason text field.

## Sample data

Synthetic; nothing real. Example: transaction `TX000123456`, client `K003797`, legal entity, PEP, outgoing payment 184,500 CZK to an account in Austria (`AAT00116`). Rule rating High ("PEP outgoing payment over 100,000 CZK"). AI rating Medium ("Payee appears monthly in the client's history with similar amounts; likely a regular supplier payment."). Payer and payee accounts are anonymised codes; there are no names, IBANs or BICs.

## Not in this step

Network graph, timeline, other charts, four-eyes approval, activity log, split view.
