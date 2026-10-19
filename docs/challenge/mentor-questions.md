# Questions for FINREG, ČNB and the AML crash course (2026-10-19)

What we need to know to fill the CSV correctly and to design the UX, with what law, guidance and our data already answer. Source ids (CZ1, EU1, G5 and so on) point to [aml-legal-sources.md](aml-legal-sources.md). Data facts come from [data-profile.md](data-profile.md).

Each question has a status:

- **Answered:** law, guidance or the data settles it. Confirm only if time allows.
- **Partly:** sources narrow it down, FINREG still decides.
- **Ask:** only FINREG or a mentor can answer. Our default is what we build until they do.

Write the mentor's answer under **Answer:** with their name and the time.

## The five that decide the score

### 1. Escalation matrix and conflict-of-interest rules (Ask)

Can we get them in writing? Who are the `executive_person` values: a staff list they provide, or names we invent per role? What in the data counts as a conflict? Nothing in it links a client to a staff member.

- Law gives roles, not a matrix. The bank's internal rules name who evaluates and who decides on filing: Act §21(5)(f) [CZ1], MP 11 [CZ7]. The contact person files the OPO: §22(1). A board member or AML delegate consents to PEP relationships: §9a(3)(d) [CZ1], MP 7 [CZ5].
- Conflict of interest in law: the contact person at a bank must not conclude or settle its transactions or work in internal audit: §22(5) [CZ1]. Compliance is second line and not subordinate to the business lines: EBA/GL/2022/05 para 31 [G4]. Assessment must avoid conflicts of interest: AMLA draft para 77 [EU4].
- No source requires four-eyes on closure or filing, and none bars an analyst from their own client. Both must come from FINREG.
- **Default:** the draft matrix in [czech-aml-escalation.md](czech-aml-escalation.md) section 6, with placeholder people per role, and code that blocks the preparer from being the approver.
- **Answer:**

### 2. Currency conversion (Partly)

The Q2 client statistics look unconverted. If we convert July as the brief says, rule A fires for all 5,493 clients and rule C for about 1,077. Is that intended, or should both sides use the same units?

- Law: convert at the ČNB rate valid on the day, or the previous day's rate if that one is not yet published: Act §54(3) [CZ1]. That is our method already.
- Data: the median amount is about 3,000 in every currency, and the Q2 average transaction is 2,999, so the generator ignored currency. Converting multiplies EUR amounts by about 24.
- **Default:** convert, because the brief says so. Rank rule A alerts on CZK-only facts so the noise doesn't drown the queue.
- **Answer:**

### 3. Which high-risk list for rule B (Partly)

No country in the data is on the July 2026 EU or FATF lists, so only the PEP branch fires.

- Law: the EU list, FATF's "call for action" list, or a country high risk "for another reason": Act §9(1)(a)(3) [CZ1], Decree §9(3)(a) [CZ2]. FAÚ calls its combined list a minimum the bank may extend [CZ8][CZ9]. Adding the FATF grey list is the bank's choice, not a legal duty.
- History: South Africa was grey-listed from February 2023 to October 2025 [G10], Türkiye from October 2021 to June 2024 [G8][G9]. Both appear in the data. The data probably used a 2023 to 2024 list.
- "Involving" a high-risk country is undefined in EU law [EU1][EU2]. FINREG's rule names payer, payee and client country, so we check all three and log which one fired.
- **Default:** the July 2026 list as the official run, with the list kept as data. Ask whether they want a run with the 2024 grey list (ZA, TR).
- **Answer:**

### 4. How they grade triage and priority (Ask)

What is their answer key for FP and REVIEW? Is priority scored by exact number, by band or by rank order across the 30 to 45 sampled alerts?

- Guidance only sets expectations: even a well-tuned rule system is about 10% effective (ČNB footnote 48 [G5]), so most alerts should end as FP.
- **Default:** priority bands (0 to 39 low, 40 to 69 medium, 70 to 100 high) with a scorecard breakdown, so any grading method can follow it.
- **Answer:**

### 5. "Include any further red flags you identify" (Ask)

Do extra flags go in the CSV with a new `alert_type`? Do they earn points?

- Candidate with a legal basis: missing payer information is a risk factor under TFR Art. 7 and 9 [EU3]. In our data every one of the 39,715 remittances has an empty payer account, so flagging all of them is noise. Use it as a priority factor instead.
- Candidate: activity after dormancy (EBA 9.6(b)(iv) [G2]); the client with no Q2 transactions fits.
- **Default:** no new alert type. Further flags raise priority and appear in the reason.
- **Answer:**

## Rule details (FINREG)

### Is "expected volume at contract" monthly? (Answered by data)

Q2 real volume over expected volume has a median of 3.36, and the counts give the same, so it is monthly. Confirm in passing.

### Q2 daily average: 91 calendar days or business days? (Ask)

Law is silent. **Default:** 91 calendar days. **Answer:**

### Clients who signed during Q2 (239 of them): prorate the baseline? (Partly)

ČNB wants thresholds that reflect segment and client-declared information (p. 6 and footnote 16 [G5]); a new client without a track record raises risk (EBA 9.6(a)(v) [G2]). **Default:** scale the Q2 baseline to the days since the contract. **Answer:**

### Rule A is one alert per client. What goes in `transaction_id`? (Ask)

**Default:** the transaction on the worst day with the highest ratio; the other days and transactions go in `log`. **Answer:**

### Do remittances count as "direction unclear" for rule B's PEP branch? (Answered by brief and data)

Remittances have no payer account, so direction is unclear, and the brief says "any transaction" then. Confirm in passing.

### Rule C: floating 24 h window or calendar days? Does "another account" mean any account that was not a payer in the window? (Ask)

No source names the pattern (UNVERIFIED as a typology). Windows often cross midnight in the data (16,217 of them). **Default:** floating window, outflow in the 6 h after the window's last inflow, to payees that were not among the window's payers. **Answer:**

## CSV columns (FINREG)

### `log`: free text, JSON or a reference? (Partly)

The content is set by law: who did each step and when, with what result, on what inputs and why: Decree §18(3) [CZ2]; a record of every assessment, reported or not: AMLR Art. 77(1)(b) [EU1]. **Default:** compact JSON with those fields, and the full event log in the app. **Answer:**

### `approver`: a role or a person? Empty for FP? (Ask)

Four-eyes is not a legal requirement (see question 1). For PEPs the approver is a board member or AML delegate [CZ1][CZ5]. **Default:** a person for every row, including FP. **Answer:**

### `reason`: length, language, should it quote thresholds and values? (Partly)

ČNB: the closure states whether and why suspicion was excluded and any further measures; a bare "OK" is a deficiency (p. 15, footnote 47 [G5]). **Default:** English, two or three sentences, with threshold, actual value and the deciding factor. **Answer:**

### "Log the final decision": the system's or a human's? (Partly)

ČNB accepts automated investigation if it is "subsequently verified" and traceable (pp. 15 to 16 [G5]); automation never replaces staff vigilance (EBA 9.12 [G2]). **Default:** the CSV holds the system's triage and the person responsible; the demo shows a human confirming. **Answer:**

### Must alert ids be stable across reruns? (Ask)

**Default:** yes, derived from rule, client and transaction. **Answer:**

## Write-up (FINREG)

### Is "backed by the data" met by counts per rule and agreement with our own labels? (Ask)

**Default:** counts per rule and branch, the share of FP, and agreement on our held-out labels, with the legal basis from [aml-legal-sources.md](aml-legal-sources.md). **Answer:**

## ČNB (Jan Bridzik, Tue 07:30; other ČNB mentors)

### Would ČNB accept automatic FP closure? (Partly)

Benchmark 2/2023 accepts "fully automated investigation of alerts that are subsequently verified", with traceable reasons and no black box (pp. 15 to 16 [G5]). AMLA's draft allows automated closure only without suspicious or material-risk indicators [EU4]. Still ask: does "subsequently verified" mean every alert, or sampling? **Answer:**

### What makes a closure reason acceptable in an inspection? (Answered)

Whether and why suspicion was excluded, further measures, delays and the steps to overcome them, reconstructable afterwards; a bare "OK" fails (pp. 13 and 15 [G5]). Ask only for examples of good reasons.

### Is the "analyst must not review their own client" rule written anywhere? (Ask)

Not found in any source. Nearest: §22(5) [CZ1], EBA/GL/2022/05 para 31 [G4], AMLA draft para 77 [EU4]. **Answer:**

### How fast must an alert be handled? (Answered)

The bank sets the deadline (Decree §17a [CZ2]); ČNB expects days for daily scenarios, counted from generation (p. 13 [G5]). An OPO goes "without undue delay", which FAÚ reads as under 5 calendar days [CZ4]. Use these for the SLA timers in the queue.

## UX (AML crash course 13:30, any analyst mentor)

Law doesn't answer these. Where guidance points somewhere, it is noted.

- What do you look at first when you open an alert, and in what order after that? **Answer:**
- What are the usual legitimate reasons a rule fires? Guidance names one mitigator: a long-standing client with no earlier concern and activity in line with the profile (EBA 9.7(a) [G2]). **Answer:**
- Do you think in ratios ("14x the usual") or in amounts? **Answer:**
- With several alerts on one client, do you work alert by alert or client by client? The link between transactions is a suspicion factor (AMLR Art. 69(2) [EU1]), which argues for a client view. **Answer:**
- What does an approver need to see to sign off in under a minute? **Answer:**
- Would a what-if view of rule thresholds help? Guidance supports it as a tuning tool: ČNB wants scenario effectiveness evaluated continuously (p. 7 [G5]), EBA wants ex-post sample review (4.75 [G2]). Ask whether analysts or only the compliance officer should see it. **Answer:**
- What would make you trust or reject an AI suggestion that an alert is a false positive? **Answer:**
- How many alerts does one analyst handle per day, and how long does each take? **Answer:**

## Business case (any jury-side mentor)

- Which tools do Czech banks use for this today, and what do analysts complain about? **Answer:**
- Who buys a tool like this: the compliance officer, IT, or the board member responsible for AML? **Answer:**
