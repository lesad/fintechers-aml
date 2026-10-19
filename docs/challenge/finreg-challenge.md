# FINREG PARTNERS AML challenge: full capture

Captured 2026-10-19 ~08:35 from https://thefintechers.notion.site/Track-5-Compliance-and-RegTech-copilots-3fc1e81998138119ae58d48c1f2656a3 via Notion's public API (loadCachedPageChunkV2, 85 blocks, none missing; page version 170). Rendered as [blocktype] text; table rows are cells joined by |. Verbatim.

## 1. Page text (whole page, ruleset included for context)

```text
[page] Track 5 · Compliance and RegTech copilots
  [callout]
    [text] Copilots that a regulator would sign off on. Regulatory monitoring, AML transaction monitoring and AI Act audits, with challenges from the Czech National Bank and FINREG PARTNERS.
  [callout]
    [text] Recommended in this track: ⭐ FINREG PARTNERS AML triage: 🗂️ ČNB synthetic dataset (about 400,000 transactions), AML Crash Course, 🏆 CZK 40,000 in legal services · ⭐ ČNB regulatory-change radar: written by the regulator, masterclass and 🧑‍🏫 Jan Bridzik, who also sits on the jury · Transaction monitoring copilot: 🗂️ the same ČNB dataset and 🧑‍🏫 ČNB mentors.
  [sub_header] 🧭 At a glance
  [table]
    [table_row] 🤝 Partners | Czech National Bank (ČNB), FINREG PARTNERS, Deloitte
    [table_row] 🏆 Challenge prize | FINREG PARTNERS awards CZK 40,000 in legal services to the 1st-place team, if that team worked on the FINREG PARTNERS AML challenge
    [table_row] 🎓 Masterclass | AML Crash Course by FINREG PARTNERS, with ČNB experts answering questions. Useful for both AML challenges (FINREG PARTNERS triage and the transaction monitoring copilot). Mon 19 Oct 13:30-14:30, Masterclass room 1, 1st floor, 45-50 min incl. Q&A · Regulatory-change radar masterclass with Jan Bridzik (ČNB), Mon 19 Oct 13:30-14:30, Masterclass room 2, 1st floor (TBC)!!!. Mentors may add more masterclasses after team formation if they see interest; any new masterclass is announced on Circle
    [table_row] 🧑‍🏫 Mentors | Jan Bridzik (ČNB, Mon 13:00-14:30, Tue 07:30-09:00) · Jan Koník, Václav Tětek, Tereza Štichová (ČNB) · Oliver Zrno (FINREG PARTNERS, Mon 17:00-19:00, Tue 09:00-11:00)
  [divider]
  [sub_header] ⭐ Partner challenges
  [sub_sub_header] ⭐ AML transaction monitoring: triage and red-flag escalation · FINREG PARTNERS
  [callout]
    [text] Challenge by FINREG PARTNERS, built on ČNB's synthetic data. Updated 18 Oct: the ruleset now uses July 2026 transactions vs. Q2 2026 client statistics. Prize: CZK 40,000 in FINREG PARTNERS legal services for the 1st-place team, if it worked on this challenge. Jan Šovar (FINREG PARTNERS) introduces it on stage at about 10:25.
  [text] ❓ Question: AML transaction monitoring is only part of the puzzle. Every red flag has to be processed, analysed and escalated where necessary. Red flags heavily outnumber the capacity of AML staff, many are false positives, and the real ones have to reach the right person in time while keeping conflicts of interest at bay. Can an automated system save AML staff time, relay important flags to the right people and make every decision explainable, justified and auditable?
  [text] 🛠️ Build: an automated system that (i) generates red flags using the ruleset below and (ii) sorts, rates and escalates each red flag to the right person. Convert all amounts to CZK. Client volume is the sum of all of a client's transactions regardless of direction (in/out), unless the briefing says otherwise.
  [sub_sub_header] 🚩 Red-flag ruleset
  [table]
    [table_row] Type | Rule | Alert unit
    [table_row] 🅰️ A · Client profile discrepancy | Daily volume in July 2026 is greater than 25% of the projected monthly volume, or greater than 3x the average daily volume in Q2 2026; or a single transaction is greater than 2x the maximum transaction in Q2 2026. Clients inactive in Q2 2026 are compared to projected volumes only | One alert per client
    [table_row] 🅱️ B · High-risk jurisdiction / PEP | A transaction above CZK 10,000 where the payer, payee or client country is on the EU or FATF high-risk jurisdictions list; or an outgoing transaction of a Politically Exposed Person above CZK 100,000 (where direction is unclear, any transaction) | One alert per transaction
    [table_row] ©️ C · Flow-through account | Within 24 hours the client receives incoming payments above CZK 100,000 and within 6 hours sends out at least 80% of that amount to another account (not the payer's account). Include any further red flags you identify | One alert per client
  [sub_sub_header] ⚙️ For every red flag, the system must
  [numbered_list] Triage: false positive or needs human review, with the specific basis (client profile, history, AML risk score, client type, relationship specifics). No red flag is decided without a decision log.
  [numbered_list] Priority 0-100 from risk factors: AML risk score, PEP, country, amount or volume, conduct discrepancies, length of the client relationship, how the contract was concluded, multiple flags on the same client.
  [numbered_list] Assign the person responsible for the final decision (escalation matrix and conflict-of-interest rules are given at the briefing).
  [numbered_list] Log the final decision.
  [callout]
    [text] FINREG PARTNERS' tip: use AI for decision-making and navigating the ruleset, not for analysing every row of data.
  [sub_sub_header] 📤 Mandatory output
  [text] A CSV with one row per alert: alert_id, alert_type, client_id, transaction_id, triage (FP/REVIEW), priority (0-100), executive_role, executive_person, approver (4 eyes), reason (text), log.
  [text] Hand in with your repo: code, the mandatory CSV, a demo (max 5 min for FINREG PARTNERS; the main stage demo is 4 min) and a description of your decision logic backed by the data (max 2 pages), focused on points 1-4 above.
  [sub_sub_header] 📊 FINREG PARTNERS evaluation
  [table]
    [table_row] Criterion | Weight
    [table_row] Triage and priority correctness (sample of 30-45 alerts, 10-15 per type) | 40%
    [table_row] Correctness of escalation (vs. the escalation matrix and conflict-of-interest rules) | 20%
    [table_row] Decision justification (on a sample of alerts) | 25%
    [table_row] Audit log, demo and solution | 15%
  [text] This scoring decides FINREG PARTNERS' challenge prize. The overall top 3 are still decided by the main jury criteria.
  [text] 📄 Brief from FINREG PARTNERS:
  [file] AML challenge.docx SRC=attachment:3488aa02-9076-458e-a471-b70660d7c136:AML_challenge.docx DISP=attachment:d0ff5d63-ef5d-41b3-baa0-cc7532638948:FinReg_AML_challenge_brief.docx
  [text] 📦 Data from ČNB: a July 2026 payment transaction log and a client log with Q2 2026 statistics, in ČNB's synthetic version: about 400,000 payment transactions from about 5,500 clients. Find it in the shared AWS bucket under CNB/ (see the ‣). Two tables:
  [bulleted_list] Transactions: transaction ID, client ID, date, time, amount, currency, payer and payee country, anonymised payer and payee account, transaction type.
  [bulleted_list] Clients: client ID, country, contract date and channel, PEP flag, client type (natural person, natural person acting in a business capacity, legal person), projected CZK volume and number of transactions at contract conclusion, actual CZK volume, number and maximum transaction amount in Q2 2026, AML risk score, other statistics (e.g. MCC) where available.
  [callout]
    [text] The ČNB dataset is handed out to registered teams at tech onboarding (Mon 10:30) and on Circle. Fully synthetic, no real clients.
  [divider]
  [sub_sub_header] 🔆 The regulatory-change radar · ČNB
  [callout]
    [text] Challenge by the Czech National Bank, mentored by Jan Bridzik (Director of ICT Risk Control and AML/CFT Supervision). Full brief (English translation and Czech original) attached below. Jan Bridzik runs a regulatory-change radar masterclass on Monday 13:30-14:30 in Masterclass room 2, 1st floor (TBC).
  [text] ❓ Question: Can an AI agent read the regulatory pipeline, map each change to a bank's internal policies and draft the gap analysis?
  [text] 🛠️ Build: A working prototype with two parts. Phase 1, monitoring agent: tracks the regulatory pipeline across DORA, the AI Act, PSD3 and MiCA, drawing on EUR-Lex, ČNB, EBA and ESMA; deduplicates sources, classifies legal status (proposal, adopted act, amendment, RTS/ITS, guidelines, Q&A, consultation, supervisory communication), detects added, amended and repealed obligations, keeps an audit trail with exact citations and shows a filterable regulatory radar. Phase 2, policy-mapping engine: maps each obligation to specific provisions of a sample of internal policies, classifies gaps (full, partial, missing, conflict, outdated reference, inconclusive), prioritises them with configurable and explainable rules, and generates a cited gap report with recommended remediation, owner, target date and a human-in-the-loop approval workflow (pending review, approved, approved with changes, rejected, returned for completion). Optional: read-only connection to an institution's document system, and draft amendment text clearly marked as a working draft.
  [text] ✅ A strong solution shows: every gap traced to a specific article and a specific policy clause, prioritised, with confidence and a reviewer step. ČNB evaluates completeness and accuracy of monitoring, quality of requirement-to-policy mapping, correct and traceable citations, distinguishing binding obligations from proposals and supervisory expectations, sensible prioritisation, robustness to ambiguous wording and a report that compliance, risk and process owners can understand.
  [text] 📄 Brief from ČNB:
  [file] CNB_The_regulatory-change_radar_EN.docx SRC=attachment:fd4d4279-b905-42d4-81f7-cb9a4c762206:CNB_The_regulatory-change_radar_EN.docx
  [file] CNB_The_regulatory-change_radar_brief_EN.md SRC=attachment:84aaa421-55c9-4983-ab76-d25cb7a3c2a5:CNB_The_regulatory-change_radar_brief_EN.md DISP=attachment:84aaa421-55c9-4983-ab76-d25cb7a3c2a5:CNB_The_regulatory-change_radar_brief_EN.md
  [text] 📦 Policy set: per the ČNB brief, teams source their own sample of internal policies (for example publicly available bank policies or ones you draft yourselves).
  [divider]
  [sub_header] 🧩 More challenges in this track
  [sub_sub_header] 🔎 The transaction monitoring copilot
  [text] ❓ Question: AML monitoring is hard because of the volume of data and the noise, not because the rules are unclear. Most flags are false positives. Can AI watch a realistic stream of transactions, flag only the ones that really need a human look, and explain each flag well enough that a compliance analyst (and later a regulator) would accept it?
  [text] 🛠️ Build: A system that scores transactions against AML typologies, ranks them by risk and writes a clear, data-backed explanation for every flag. Stretch goals: sensitivity tuning for a compliance officer, or a case-narrative generator a reviewer could sign off.
  [text] 📦 Data: the same ČNB synthetic dataset (about 400,000 transactions from about 5,500 clients), handed out at tech onboarding.
  [text] 🎓 Masterclass: the AML Crash Course (Mon 13:30-14:30, Masterclass room 1) covers this challenge too.
  [sub_sub_header] 🤖 The AI Act self-audit
  [text] ❓ Question: A bank has 40 AI models in production. Which are high-risk under the AI Act, and what documentation is missing? Can this audit run itself?
  [text] 🛠️ Build: A model-inventory copilot that classifies AI systems by AI Act risk tier, generates the required technical documentation skeletons and flags gaps.
  [sub_header] 🛠️ Tech stack and data
  [table]
    [table_row] When | What you get | Resource
    [table_row] Tech onboarding, Mon 10:30 | ~400,000 transactions, ~5,500 clients, PEP flag, AML risk, MCC codes | 🗂️ ČNB synthetic AML dataset
    [table_row] Download now | ČNB radar brief and FINREG PARTNERS AML brief (attached above) | 📄 Challenge briefs
    [table_row] Any time | EUR-Lex, ČNB, EBA and ESMA, all public | 📚 Regulatory sources
    [table_row] Logins at the AWS Toolbox, Mon 12:00-13:30 (mandatory) | One account per team with Amazon Bedrock, USD 800 budget per team. See the AWS Participant Guide | ☁️ AWS team account
  [sub_header] 💡 Tips
  [bulleted_list] Go to the AML Crash Course on Monday at 13:30 if you take either AML challenge.
  [bulleted_list] Mentoring from ČNB is expert guidance, not a regulatory opinion or endorsement.
  [sub_header] 🇪🇺 Extra dataset: EU financial firm licences and regulator warnings
  [text] About 10,500 official public records (Mostly Right): regulator warnings (AMF blacklists, ESMA non-compliant CASPs), EU financial sanctions (entities only), ČNB and ESMA licence registers. Combine it with the ČNB synthetic AML dataset to screen counterparties for red flags. Dataset page. Available in your team AWS account from tech onboarding on Day 1.
```

The ‣ mention in the data paragraph links to the page "AWS Participant Guide: your AWS account, start to finish". Its shared-datasets section, verbatim (bucket account id replaced by a placeholder):

```text
  [sub_header] 🗂️ Shared datasets
  [text] Everything the track owners hand over is in one bucket, readable from your own account (no extra credentials, no account switching):
  [code] aws s3 ls s3://ai-hackathon-datasets-<aws-account-id>/ --region eu-central-1
  [text] The bucket is read-only on purpose: nobody can alter a dataset other teams are judged on. Copy what you need into your own account.
  [table]
    [table_row] Best for | Folder | What is in it
    [table_row] Track 5 (AML challenges) | CNB/ | Synthetic AML data. clients.csv (5,493 rows, 12 columns: contract date and channel, PEP flag, client type, expected vs actual volume and count for 2Q2026, AML risk score low/medium/high) and transactions.csv (397,853 rows, 11 columns, joins on client ID). Semicolon-delimited, UTF-8 with BOM. No real names or accounts
    [table_row] Track 4 (Tapaya KYB challenge) | MerchantKYB/ | Eight PDFs: merchant application forms A and B, partner application, UBO declaration and checklist, short-form merchant agreement. Pair with Required-Documents-Checklist.pdf for a completeness check
    [table_row] Tracks 1, 4, 5 | MostlyRIght/ | EU financial firm licences and warnings: ČNB and ESMA MiCA licence registers, EPC SEPA Instant and Verification of Payee participants, AMF and ESMA warnings, EU sanctions (entities only)
  [code] import pandas as pd
clients = pd.read_csv("clients.csv", sep=";")
txns = pd.read_csv("transactions.csv", sep=";")
df = txns.merge(clients, on="client ID")
```

## 2. Brief docx text

The file block has two attachments. `source` = AML_challenge.docx (current: July 2026 / Q2 2026 periods, matches the page's 'Updated 18 Oct' note). `display_source` = FinReg_AML_challenge_brief.docx (older: 1.9.2026 log, 25.-31.8.2026 baseline, >2M rows). Text otherwise identical; diff shown after.

### 2a. AML_challenge.docx (current), textutil extraction

```text
AML challenge: Triage and red flag escalation - FINREG PARTNRES
Prize: 40.000 CZK usable on our legal services
Question
AML transaction monitoring is only a part of the puzzle. Every identified red flag has to be processed, analysed and escalated where necessary. The number of identified red flags heavily outnumbers the capacity of AML personnel – significant number of red flags are false positive flags, and the real flags have to be relayed to the right person in time while keeping conflicts of interests at bay. Can an automated system optimize valuable time of AML personnel, relay important flags to the right people and ensure that every decision is explainable, justified and auditable?
Data
	•	Payment transaction log from July 2026 (~ 400.000 transactions): transaction ID, client ID, date, time, volume, currency, payer country, payee country, anonymised payer and payee account number, transaction type.
	•	Client log: client ID, client country, date and form of contract conclusion, Politically Exposed Person (yes/no), client type (natural person / natural person acting in a business capacity / legal person), projected volume CZK and number of payment transactions at the time of contract conclusion, actual volume CZK, number and a maximum payment transaction amount from Q2 of 2026, AML risk-score; other statistical data (e. g. MCC), if available.
Build
Build an automated system, which (i) can generate red flags pursuant to the provided ruleset below; and (ii) can sort, rate and escalate each red flag to the right person.
Transaction volume shall be converted to CZK. Client volume reflects the sum of every transaction of a client regardless their direction (in/out) unless specified otherwise at the initial briefing.
Red flag identification ruleset:
	•	Type A – Discrepancy of client profile (one alert per client): daily volume from July 2026 is greater 25 % than the projected monthly volume or is greater 3x than average daily volume from Q2 of 2026., or a single transaction is greater 2x than the max volume from Q2 2026. Inactive clients in Q2 of 2026 are only compared to projected volumes.
	•	Type B – Shady jurisdiction / PEP (one alert per transaction): one transaction greater than 10.000 CZK, where the country of payer, payee or a client is part of the EU or FATF high-risk jurisdictions list; or an outgoing transaction (where the direction is not clear, any transaction) of a client who is a Politically Exposed Person (PEP) is greater than 100.000 CZK.
	•	Type C – Flow-through account (one account per client): the client, during 24 hours, accepts incoming payment transactions greater than 100.000 CZK and in 6 hours executes outgoing payment transactions amounting to at least 80 % of the incoming payment transactions to another account (payment account other than a payment account of the payer). Should further red flags be identified, make sure they are included.
For every red flag, the automated system shall
	•	Make a triage decision – false positive / require human oversight and justify the decision by stating specific basis for such decision (client profile, client history, AML risk score, client type, client relationship specifics etc.). No reg flag shall be decided without proper decision log.
	•	Assign priority (0–100) based on risk factors: AML risk score, PEP, country, amount / volume, client conduct discrepancies, duration of a relationship with the client, form of contract conclusion, conjunction of multiple flags of the same client.
	•	Assign the person responsible for ultimately deciding on a red flag.
	•	Log the final decision.
Recommendation: make use of AI for decision-making and ruleset navigation, not for analysing every row of data.
Outcome (mandatory format) CSV with a row for every alert: alert_id, alert type, client_id, transaction_id, triaz (FP/REVIEW), priority (0–100), executive_role, executive_person, approver (4 eyes), reason (text), log.
Evaluation criteria
	•	Triage and priority correctness – will be judged on a sample of 30–45 alerts (10–15 per type) (40 %).
	•	Correctness of escalation – compared to the escalation matrix and conflicts of interest rules (20 %).
	•	Decision justification – judged on a sample of alerts (25 %).
	•	Audit log, demo and solution (15 %).
Expected data to provide along with your outcome
Code, mandatory CSV, demo max. 5 minutes a description of decision logic supported by used data (max. 2 pages) focusing on the ruleset above (points 1-4).

```

### 2b. FinReg_AML_challenge_brief.docx (older) differences

```diff
6,7c6,7
< 	•	Payment transaction log from 1. 9. 2026 (more than 2 mil. roes): transaction ID, client ID, date, time, volume, currency, payer country, payee country, anonymised payer and payee account number, transaction type.
< 	•	Client log: client ID, client country, date and form of contract conclusion, Politically Exposed Person (yes/no), client type (natural person / natural person acting in a business capacity / legal person), projected volume CZK and number of payment transactions at the time of contract conclusion, actual volume CZK, number and a maximum payment transaction amount between 25.–31. 8. 2026, AML risk-score; other statistical data (e. g. MCC), if available.
---
> 	•	Payment transaction log from July 2026 (~ 400.000 transactions): transaction ID, client ID, date, time, volume, currency, payer country, payee country, anonymised payer and payee account number, transaction type.
> 	•	Client log: client ID, client country, date and form of contract conclusion, Politically Exposed Person (yes/no), client type (natural person / natural person acting in a business capacity / legal person), projected volume CZK and number of payment transactions at the time of contract conclusion, actual volume CZK, number and a maximum payment transaction amount from Q2 of 2026, AML risk-score; other statistical data (e. g. MCC), if available.
12c12
< 	•	Type A – Discrepancy of client profile (one alert per client): daily volume from 1.9.2026 is greater 25 % than the projected monthly volume or is greater 3x than average daily volume from 25.-31. 8. 2026., or a single transaction is greater 2x than the max volume from 25.-31. 8. 2026. Inactive clients between 25.-31- 8. 2026 are only compared to projected volumes.
---
> 	•	Type A – Discrepancy of client profile (one alert per client): daily volume from July 2026 is greater 25 % than the projected monthly volume or is greater 3x than average daily volume from Q2 of 2026., or a single transaction is greater 2x than the max volume from Q2 2026. Inactive clients in Q2 of 2026 are only compared to projected volumes.
```

## 3. Other Track 5 challenges

Verbatim page text for the ČNB radar, transaction monitoring copilot and AI Act self-audit is in section 1. No dataset field list exists for the copilot beyond 'the same ČNB synthetic dataset' (fields as in the FINREG data paragraph and the AWS guide row above). The AI Act self-audit names no dataset. The ČNB radar policy set is team-sourced.

ČNB radar brief (markdown attachment) downloaded to finreg/CNB_radar_brief_EN.md; headings: 1. Context and main objective, 2. Phase 1: Monitoring the regulatory pipeline, 3. Phase 2: Internal policy mapping and gap analysis. Not reproduced here (out of scope for FINREG).

## 4. UNREAD / not available

- Escalation matrix and conflict-of-interest rules: not on the page or in either docx. The page says they 'are given at the briefing' (Jan Šovar on stage ~10:25; AML Crash Course Mon 13:30-14:30, Masterclass room 1). Ask Oliver Zrno (FINREG mentor, Mon 17:00-19:00, Tue 09:00-11:00) or check Circle.
- High-risk jurisdiction list (EU / FATF): referenced, not supplied. Teams must source it.
- Whether 'volume' at briefing is redefined (docx: 'unless specified otherwise at the initial briefing').
- The ČNB dataset itself (S3 CNB/), handed out at tech onboarding Mon 10:30; no sample linked on the page.
- CNB_The_regulatory-change_radar_EN.docx: not downloaded (markdown version fetched instead).
- Circle posts: not accessed (login required).
- MostlyRight dataset page https://mostlyright.md/datasets/eu-financial-firm-licences-and-regulator-warnings: not opened.
