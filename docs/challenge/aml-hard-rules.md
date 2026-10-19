# AML hard rules: EU + Czech Republic, today and from 10 July 2027 (2026-10-19)

Not legal advice. Primary texts read for this note: **Act 253/2008 Sb.** (zakonyprolidi.cz consolidated version 32, in force 11 Jan 2026) and **Regulation (EU) 2024/1624 (AMLR)** (OJ L series, 19.6.2024, retrieved from the EU Publications Office cellar store — EUR-Lex HTML is behind a bot wall). Everything quoted below with a § or Article number comes from those two texts. Sources I did **not** open are marked as such and must not be cited as verified.

Companion notes: [czech-aml-escalation.md](czech-aml-escalation.md) (roles, FAÚ path, 4-eyes, AI guidance), [rule-b-reference-data.md](rule-b-reference-data.md) (high-risk lists).

---

## 1. What counts as a source of "rules and scenarios"

Two different things get called a rule in AML, and the challenge needs both kept apart:

- **Hard rules** — statutory obligations with a fixed trigger: a threshold, a status (PEP, high-risk country, sanctions), a deadline, a record. These are codeable and are what sections 3 and 4 enumerate.
- **Scenarios** — the detection patterns a monitoring system runs. In the Czech Republic the law supplies a *demonstrative* catalogue (§6(1) a–j); it is **not** closed and is not a specification. In the AMLR there is no equivalent list at all — it is replaced by a duty to examine (Art. 34(2)), risk factors (Annex III) and forthcoming AMLA guidelines.

### Instrument inventory

| Instrument | Status on 2026-10-19 | Defines rules? | Defines scenarios? | Read for this note |
| --- | --- | --- | --- | --- |
| Act 253/2008 Sb. (CZ AML Act) | In force | Yes — the operative set | Yes — §6(1), demonstrative | **Yes, primary text** |
| Decree (vyhláška) 67/2018 Sb. (ČNB) | In force | Yes — internal-policy system, record content | Indirectly (monitoring design) | No — summarised in the companion note |
| Act 69/2006 Sb. (international sanctions) | In force | Yes — referenced by §6(2) | Hit-based | No — only via §6(2) cross-reference |
| Act 254/2004 Sb. (cash payment limit) | In force | Yes — CZK 270 000 | No | No — figure from secondary sources |
| Directive (EU) 2015/849 as amended (AMLD4/5) | In force until 10 Jul 2027 | Yes, but **transposed**: the binding text in CZ is Act 253/2008 | No | No — superseded by AMLR for the 2027 set |
| Regulation (EU) 2023/1113 (Transfer of Funds / travel rule) | Applies since 30 Dec 2024 | Yes — originator/beneficiary data on transfers | No | No — thresholds from secondary sources |
| **Regulation (EU) 2024/1624 (AMLR)** | **Applies from 10 Jul 2027** (Art. 90) | Yes — directly applicable, no transposition | Partly — Art. 34(2), Annex III | **Yes, primary text** |
| Directive (EU) 2024/1640 (AMLD6) | Transposition pending | Supervision, FIU powers, BO registers | No | No |
| Regulation (EU) 2024/1620 (AMLA) | AMLA operating | Guidelines, direct supervision | Via guidelines | No |

A directive is not directly a source of hard rules for a Czech bank — Act 253/2008 is. A **regulation** is. That single fact is the reason the 2027 picture is a different document rather than an amendment.

---

## 2. Reading the two sets

Set 1 is what a Czech obliged entity is bound by **today**. It is Czech statute, because the current EU layer reaches the bank only through transposition.

Set 2 is what binds it **from 10 July 2027**. It is EU regulation text, because from that date the AMLR applies directly and Act 253/2008 is largely displaced.

Thresholds in Act 253/2008 are written in **EUR** in the statute itself, not CZK — no conversion rule is needed to read them.

### 2.1 Three kinds of entry — only one is a threshold rule

Sections 3 and 4 list roughly 90 entries. They are **not** 90 hard rules with thresholds. They are three different kinds of thing, and the distinction decides what can go into code:

| Kind | What it is | Codeable as | Count (CZ / EU) |
| --- | --- | --- | --- |
| **T — threshold rule** | Statutory obligation with an exact number: an amount, a deadline, a percentage, a period | A constant + a comparison | **~22 / ~28** |
| **Q — qualitative duty** | Statutory obligation with no number: "without undue delay", "conspicuously more", "clearly disproportionate", "unusually large" | A **calibration decision we make**, not a constant from law | ~25 / ~30 |
| **F — risk factor** | Non-exhaustive list a risk assessment must *take into account* (§6(1) is demonstrative; Annex III says "non-exhaustive") | A feature or a score input, never a trigger | ~12 / ~25 |

**The single most important finding for this build:** *not one* statutory number in either regime governs **detection**. Every threshold below gates **customer due diligence**, sets a **deadline**, or sets a **retention period**. The entries that actually map to challenge rules A, B and C — §6(1)(a), (b), (d), (e), (f), (h) and AMLR Art. 34(2) — are **all kind Q or F, with no number at all**.

So: **the numeric thresholds in rules A, B and C are our calibration, not law.** They cannot be cited to a §. They have to be defended as a documented, risk-based policy choice — which is exactly what §9(3) (justify proportionality to the supervisor) and §21a (risk assessment) require them to be, and what the ČNB benchmark expects to see reconstructable. Presenting them as statutory would be wrong and a judge who knows the Act would catch it.

### 2.2 Threshold register — every exact number, both regimes

Verified by exhaustive regex sweep over both primary texts, not by recall. Penalty amounts (§43–§53: fines to CZK 130 000 000) are omitted — they are sanctions for breach, not operating rules.

> **This is a complete statutory inventory, not a scope list.** Most of it binds the bank as an institution (onboarding gates, governance deadlines, staff training, cash handling) and will never reach this app. For the subset the app can actually enforce, go to **§7**, which filters this register against the dataset and the app's scope and discards roughly two thirds of it.

**Today — Act 253/2008 Sb.**

| # | Threshold | Rule | § |
| --- | --- | --- | --- |
| T1 | **EUR 1 000** | Identify the client once it is clear the transaction will exceed it | §7(1) |
| T2 | **EUR 1 000** (ceiling) | Self-set per-product identification threshold may never be higher | §7(4) |
| T3 | **EUR 15 000** | Run CDD before an occasional transaction at or above | §9(1)(a)(1) |
| T4 | **EUR 2 000** | Run CDD — gambling operators (§2(1)(c)) | §9(1)(a)(5) |
| T5 | **EUR 1 000** | Run CDD on any transfer of funds at or above | §9(1)(a)(6) |
| T6 | **EUR 10 000** | Run CDD — traders in goods accepting cash, auctioneers (§2(1)(n), (2)(c)–(d)) | §9(1)(d) |
| T7 | statutory figure (ceiling) | Self-set CDD threshold may never exceed it | §9(5) |
| T8 | **EUR 10 000 / month** | Rent or lease at or above makes the intermediary an obliged entity | §2(1)(d)(2) |
| T9 | **EUR 10 000** | Precious-metal / precious-stone dealer is an obliged entity at or above | §2(1) |
| T10 | **EUR 150** | Identification exemption — non-reloadable e-money, max stored amount | §13a(1)(a) |
| T11 | **EUR 150 / month** | Identification exemption — reloadable domestic e-money, monthly limit | §13a(1)(b) |
| T12 | **EUR 250** per txn / **EUR 2 500** per year | Identification exemption — mobile-network payments, per transaction and per phone number per calendar year | §13a(1)(c) |
| T13 | **EUR 50** | Exemption falls away on redemption above this amount | §13a(2) |
| T14 | **EUR 1 000** | Exemption ceiling for certain intermediated transfers | §14 |
| T15 | **12 months** (minimum) | PEP obligations continue after the person leaves the function | §4(8) |
| T16 | **10 years** | Retention of identification, CDD, risk-profile and OPO-assessment records | §16(1)–(2) |
| T17 | **10 years** / **5 years** | Retention for §2(1)(i)–(j) entities: 10y where the transaction was ≥ EUR 10 000, otherwise 5y | §16(4) |
| T18 | **24 hours** | Earliest execution of a suspicious order, from FAÚ's receipt of the OPO | §20(1) |
| T19 | **+2 working days** | FAÚ may extend the postponement | §20(3)(a) |
| T20 | **3 working days** | FAÚ may order postponement / asset freeze at the holding entity | §20(3)(b) |
| T21 | **+3 working days** | Further extension once FAÚ files a criminal complaint | §20(7) |
| T22 | **10 years** | Must answer whether a relationship existed in the preceding 10 years — and maintain a system able to | §24(3) |
| T23 | **60 days** | Establish the written internal-policy system / risk assessment after becoming an obliged entity | §21(2), §21a(2) |
| T24 | **30 days** / **15 days** | Notify the contact person / notify changes | §22(2) |
| T25 | **12 months** | Staff training at least once per period | §23 |
| T26 | **EUR 10 000** | Declare cash import/export to the customs office | §41 |
| T27 | **EUR 15 000** | Duty to disclose details of a cash movement on customs demand | §41a |
| T28 | **CZK 270 000** | Cash payment limit — *separate act, secondary sources only* | Act 254/2004 |

**From 10 July 2027 — Regulation (EU) 2024/1624**

| # | Threshold | Rule | Art. |
| --- | --- | --- | --- |
| E1 | **EUR 10 000** | CDD on an occasional transaction, single **or linked** | 19(1)(b) |
| E2 | **EUR 1 000** | CDD on an occasional transfer of funds (credit/financial institutions) | 19(2) |
| E3 | **EUR 1 000** | CASPs: full CDD at or above | 19(3)(a) |
| E4 | **no floor** | CASPs: identification **below** EUR 1 000 — i.e. from the first euro | 19(3)(b) |
| E5 | **EUR 3 000** | Identification on an occasional **cash** transaction, single or linked | 19(4) |
| E6 | **EUR 2 000** | CDD — gambling, on stake or on collection of winnings | 19(5) |
| E7 | **EUR 150** | Identification exemption — non-reloadable e-money | 19 |
| E8 | **EUR 1 000** (ceiling) | Member State exemptions may not exceed | 6 |
| E9 | **EUR 10 000 / month** | Rent or lease at or above brings the intermediary in scope | 3 |
| E10 | **EUR 5 000 000** turnover | Football-club exemption threshold | 5 |
| E11 | **EUR 5 000 000** assets **and** **EUR 50 000 000** total wealth | Wealth-management EDD trigger on a higher-risk relationship | 34(5) |
| E12 | **25 %** | Beneficial ownership through ownership interest — indirect holdings multiplied down each chain and summed across chains | 52(1) |
| E13 | **50 % + 1** | Control through ownership interest | 53(2)(c) |
| E14 | **> 50 %** | Sanctions screening reaches persons controlling, or holding more than half the proprietary rights of, a legal entity | 20(1)(d) |
| E15 | **1 year** / **5 years** | Hard ceiling on the customer-data refresh interval: higher-risk / all others | 26(2) |
| E16 | **12 months** (minimum) | PEP measures continue after the person leaves the function | 45(2) |
| E17 | **3 working days** | Refrain from the transaction; may proceed after a risk assessment if the FIU is silent | 71(1) |
| E18 | **5 working days** | Answer FIU information requests | 69(1) |
| E19 | **under 24 hours** | FIU may shorten that deadline in justified, urgent cases | 69(1) |
| E20 | **5 working days** | Provide CDD information to an entity relying on you | 49(3) |
| E21 | **5 working days** | Supply identity data behind a virtual IBAN on request | 22(3) |
| E22 | **14 calendar days** | Report a BO-register discrepancy from detection | 24 |
| E23 | **60 days** | Latest completion of verification postponed under simplified due diligence | 33 |
| E24 | **28 calendar days** | BO information obtained / registered / updated | 62, 63, 64, 67 |
| E25 | **5 years** | Record retention from end of relationship, occasional transaction, **or refusal** | 77(3) |
| E26 | **+5 years** (max) | Case-by-case extension by a competent authority | 77(3) |
| E27 | **5 years** | BO information kept after an entity is dissolved | 63(6), 64 |
| E28 | **EUR 10 000** | EU-wide cash payment limit, single **or linked** operations | 80(1) |
| E29 | **20 calendar days** | Commission deadline to adopt the high-risk-country delegated act | 29, 30 |
| E30 | **EUR 250 000** / **EUR 7 500 000** / **EUR 10 000** | High-value goods in scope: motor vehicles / watercraft and aircraft / jewellery and watches | 67, 74, Annex IV |

### 2.3 What this means for rules A, B and C

| Challenge rule | Is there a statutory number? | What the law actually gives us |
| --- | --- | --- |
| **A — profile discrepancy** | **No** | §6(1)(b) "conspicuously more operations than is usual for his activity"; §6(1)(e) "clearly do not correspond" — both kind Q. AMLR Art. 34(2)(b) "unusually large" — also Q. |
| **B — high-risk jurisdiction / PEP** | **No amount; yes a status** | The trigger is **list membership**, not a number. That makes B the only rule of the three with a hard, non-calibrated trigger — §9a(2)(a)–(b) and §15(2) fire on status alone, at any amount. |
| **C — flow-through** | **No** | §6(1)(a) "immediately after cash deposits" — a *temporal* condition with no stated window and no amount. "Immediately" is ours to define. |

Practical consequence: **rule B is the one to make unconditional and threshold-free in code.** Rules A and C must carry an explicit, documented calibration with its rationale, flagged in the write-up as policy rather than statute.

---

## 3. Rule set 1 — in force now (Act 253/2008 Sb.)

> The entries below are the **full** obligation set, mixing kinds T, Q and F (see §2.1). For the numbers alone, use the threshold register in §2.2 — most entries here carry no number and are not codeable as a constant.

### 3.1 Identification and CDD triggers

| ID | Rule | Source |
| --- | --- | --- |
| CZ-ID-1 | Identify the client at the latest once it is clear the transaction value will exceed **EUR 1 000** | §7(1) |
| CZ-ID-2 | Identify regardless of any threshold when: it is a **suspicious transaction**; a **business relationship** is being established; buying/taking cultural property, used goods or goods without proof of acquisition, or taking items in pledge; paying out a cancelled bearer passbook balance | §7(2) a–d |
| CZ-ID-3 | The entity must set its own per-product identification threshold from its risk assessment; **it may never be higher than EUR 1 000** | §7(4) |
| CZ-CDD-1 | Run client control (CDD) before an occasional transaction once it reaches **EUR 15 000** or more | §9(1)(a)(1) |
| CZ-CDD-2 | Run CDD before an occasional transaction **with a PEP** — no threshold | §9(1)(a)(2) |
| CZ-CDD-3 | Run CDD before an occasional transaction **with a person whose country of origin is a high-risk third country** — no threshold | §9(1)(a)(3) |
| CZ-CDD-4 | Run CDD on any **transfer of funds of EUR 1 000 or more** | §9(1)(a)(6) |
| CZ-CDD-5 | Run CDD for gambling operators at **EUR 2 000**; for precious-metal/stone dealers and cash traders at **EUR 10 000** | §9(1)(a)(5), §9(1)(d) |
| CZ-CDD-6 | Run CDD **throughout** the business relationship, not only at onboarding | §9(1)(c) |
| CZ-CDD-7 | Self-set CDD thresholds may never exceed the statutory figure | §9(5) |

### 3.2 What CDD must contain

| ID | Rule | Source |
| --- | --- | --- |
| CZ-CDD-8 | Obtain and evaluate the **purpose and intended nature** of the transaction/relationship and the nature of the client's business | §9(2)(a) |
| CZ-CDD-9 | Identify the **beneficial owner** and verify from trustworthy sources; where the client is registrable, verify from the BO register **plus at least one further source**; check whether the BO is a PEP or sanctioned | §9(2)(b) |
| CZ-CDD-10 | For legal persons/trusts, map the **ownership and control structure** and check it for sanctioned persons | §9(2)(c) |
| CZ-CDD-11 | **Ongoing monitoring** of the relationship, reviewing transactions against what is known about the client and their business and risk profile | §9(2)(d) |
| CZ-CDD-12 | Review the **source of funds or other assets** involved | §9(2)(e) |
| CZ-CDD-13 | For a PEP relationship, take adequate measures to establish the **source of wealth** | §9(2)(f) |
| CZ-CDD-14 | Record, for the BO, the data used to verify identity **and the procedure followed** to establish it | §9(6)(a) |
| CZ-CDD-15 | Be able to **justify the proportionality** of the CDD scope to the supervisor and evidence how it was performed | §9(3) |

### 3.3 Enhanced due diligence (EDD)

| ID | Rule | Source |
| --- | --- | --- |
| CZ-EDD-1 | EDD is **mandatory** (no discretion) in three cases: a relationship with a person whose country of origin is a **high-risk third country** (at entry and throughout); a **transaction connected to a high-risk third country**; a transaction or new relationship **with a PEP** | §9a(2) a–c |
| CZ-EDD-2 | EDD is also required whenever the entity's own risk assessment flags elevated risk | §9a(1) |
| CZ-EDD-3 | EDD measures available: extra documents/information on the BO, the intended nature of the relationship and the **source of funds and wealth** of client and BO; verify from **multiple** trustworthy sources; regular intensified monitoring; **approval of a board member or their AML delegate** to open or continue the relationship; require the first payment from an account in the client's own name at a qualifying credit institution; other measures | §9a(3) a–f |
| CZ-EDD-4 | **High-risk country case: at minimum (a), (b), (c), (d) and (f)** — i.e. source of funds *and* multi-source verification *and* intensified monitoring *and* board-level approval are all compulsory | §9a(4) |
| CZ-EDD-5 | **PEP case: at minimum (a)(3), (c) and (d)** — source of funds/wealth, intensified monitoring, board-level approval | §9a(4) |
| CZ-EDD-6 | PEP obligations continue **at least 12 months** after the person leaves the function, and in any case until the risk assessment rules the PEP-specific risk out | §4(8) |

### 3.4 Scenario catalogue — §6, the statutory red flags

§6(1) defines a suspicious transaction as one carried out in circumstances raising suspicion of laundering or terrorist financing, **or any other fact that could indicate such suspicion**, and then says "**zejména**" (in particular) before the list. The list is open: a pattern not on it can still be suspicious, and a pattern on it is not automatically a report.

| ID | §6(1) indicator | Maps to challenge rule |
| --- | --- | --- |
| CZ-S-a | Client makes **withdrawals or transfers to other accounts immediately after cash deposits** | **C — flow-through** |
| CZ-S-b | Within one day or immediately following days, the client performs **conspicuously more operations than is usual for their activity** | **A — profile discrepancy** |
| CZ-S-c | The **number of accounts** opened is clearly disproportionate to the client's business or assets | A |
| CZ-S-d | Transfers with **no apparent economic reason**, or complex or unusually large transactions | A / C |
| CZ-S-e | The funds handled **clearly do not correspond** to the nature or scale of the client's business or their assets | **A — profile discrepancy** |
| CZ-S-f | The **account is used contrary to the purpose for which it was opened** | A / C |
| CZ-S-g | Client conducts activities that may help **conceal their identity or the BO's identity** | B |
| CZ-S-h | The client or BO is a person **from a state that insufficiently applies or does not apply AML/CFT measures** | **B — jurisdiction** |
| CZ-S-i | The obliged entity **doubts the truthfulness** of the identification data obtained | B |
| CZ-S-j | The client **refuses to submit to control** or refuses to state the identification data of the person they act for | B |

§6(2) is the only **closed, automatic** part — a transaction is suspicious **always** when:

| ID | §6(2) trigger | |
| --- | --- | --- |
| CZ-S-SANC-1 | The client, a person in their ownership or control structure, their BO, a person acting for them, or any other participant known to the entity is a person subject to **international sanctions** under Act 69/2006 | §6(2)(a) |
| CZ-S-SANC-2 | The subject of the transaction is, or is to be, **goods or services** under those sanctions | §6(2)(b) |

Note what §6(1)(h) does **not** say: it is not tied to the EU delegated-act list. It says "a state that insufficiently or not at all applies AML/CFT measures" — broader, and a judgement. The EU-list concept lives separately in §9(1)(a)(3)/§9a as "high-risk third country". For the challenge's rule B, both readings exist and they are not the same set. See the open point in [rule-b-reference-data.md](rule-b-reference-data.md).

### 3.5 Blocking rules — when the bank must not transact

| ID | Rule | Source |
| --- | --- | --- |
| CZ-BLK-1 | **Refuse** the transaction or the relationship, or terminate the relationship, where identification or CDD is required and the client refuses identification, refuses to evidence authority, or does not cooperate with CDD | §15(1)(a) |
| CZ-BLK-2 | Same where identification or CDD **cannot be performed** for another reason | §15(1)(b) |
| CZ-BLK-3 | Same where the person performing it **doubts the truthfulness of information or the authenticity of documents** | §15(1)(c) |
| CZ-BLK-4 | **Do not transact with a PEP at all** — including inside an existing relationship — if the **origin of the funds or assets is unknown** to the entity | §15(2) |
| CZ-BLK-5 | **Do not perform** CDD (or a part of it) where doing so could frustrate or endanger the investigation of a suspicious transaction, or where FAÚ instructs so; and where it is skipped on the entity's own judgement, **an OPO must always be filed** | §9b, §18(1) last sentence |

CZ-BLK-4 is the sharpest hard rule in the whole Czech set for a triage system: it is unconditional, it has no threshold, and it is the only rule that bars a transaction on a status plus a missing fact rather than on suspicion.

### 3.6 Reporting and the hold

| ID | Rule | Source |
| --- | --- | --- |
| CZ-RPT-1 | Evaluate available information and **detect** suspicious transactions; report to FAÚ **without undue delay** ("bez zbytečného odkladu"); **immediately** where circumstances require it, in particular where delay is risky. **No day count exists in the Act.** | §18(1) |
| CZ-RPT-2 | The OPO must carry: identification data of the subject, identification data of **all other participants** known at filing, **the material circumstances** of the transaction, and anything else relevant to assessing it | §18(2) |
| CZ-RPT-3 | The OPO must **not** name the employee who detected the transaction | §18(3) |
| CZ-RPT-4 | Where sanctioned assets are involved, flag that in the OPO and describe the asset, its location, its owner, and whether damage/dissipation is imminent | §18(5) |
| CZ-RPT-5 | Give FAÚ the **name and job position** of the contact person or the preparer, and how to reach them | §18(6) |
| CZ-RPT-6 | Where CDD was skipped under §9b(a), the OPO must also state the **circumstances and reasons**, and **which specific step** was not performed | §18(7) |
| CZ-HOLD-1 | Where immediate execution would frustrate or substantially impede securing the proceeds, the entity **may** execute the client's order **no earlier than 24 hours** after FAÚ receives the OPO, and must secure the asset against manipulation; the postponement must be flagged in the OPO | §20(1) |
| CZ-HOLD-2 | Do not postpone where postponement is impossible or where the entity knows it would frustrate the investigation — in that case inform FAÚ **immediately** after executing | §20(2) |
| CZ-HOLD-3 | FAÚ may instruct an extension of **up to 2 further working days**, or a postponement/asset freeze of **up to 3 working days** at the entity holding the asset | §20(3) a–b |
| CZ-HOLD-4 | If FAÚ does not notify a criminal complaint by the end of that period, **execute the order** | §20(6) |
| CZ-HOLD-5 | If FAÚ files a criminal complaint in time, the hold extends by a further **3 working days** from that filing | §20(7) |
| CZ-RPT-7 | Filing is **not** a breach of confidentiality, and the filer must not suffer retaliation | §18(9) |

### 3.7 Records and retrievability

| ID | Rule | Source |
| --- | --- | --- |
| CZ-REC-1 | Retain for **10 years** from the occasional transaction or from the end of the relationship: identification data; copies of documents taken; **who performed the first identification and when**; CDD information and document copies | §16(1) a–d |
| CZ-REC-2 | Retain **records of every step taken during identification and CDD, including information on any difficulties encountered** | §16(1)(e) |
| CZ-REC-3 | Retain **the record of how the client's risk profile was assessed and set, the choice of measures applied, and the assessment of the facts bearing on whether an OPO was filed** | §16(1)(f) |
| CZ-REC-4 | Retain in a manner and scope that makes individual transactions and the procedures around them **provable** (průkaznost) | §16(3) |
| CZ-REC-5 | The 10-year clock starts the first day of the calendar month after the month of the last known act of the transaction; after expiry, **delete** | §16(5) |
| CZ-REC-6 | On FAÚ instruction, state within the set deadline whether a relationship with a named person exists **or existed in the previous 10 years**, and its nature — and **maintain an effective system to answer that** | §24(3) |

CZ-REC-3 is the provision the whole triage log exists to satisfy. It requires the reasoning behind a **non-report** to be retained, not just reports.

### 3.8 Cash

| ID | Rule | Source |
| --- | --- | --- |
| CZ-CASH-1 | Cash payments above **CZK 270 000** per day are prohibited; the payer must pay non-cash and the payee must refuse a cash payment over the limit. Penalties to CZK 500 000 (natural person) / CZK 5 000 000 (legal or business person). | Act 254/2004 Sb. — **secondary sources only, not read in primary text** |

---

## 4. Rule set 2 — from 10 July 2027 (Regulation (EU) 2024/1624)

> As with section 3, this is the full obligation set across kinds T, Q and F. The numbers alone are in §2.2.

Applies **from 10 July 2027** directly in every Member State, with no transposition; for the obliged entities in Art. 3(3)(n) and (o) only from 10 July 2029 (Art. 90). References to Directive 2015/849 are to be read as references to the AMLR and to Directive 2024/1640 (Art. 89).

### 4.1 CDD triggers and thresholds

| ID | Rule | Article |
| --- | --- | --- |
| EU-CDD-1 | Apply CDD when **establishing a business relationship** | 19(1)(a) |
| EU-CDD-2 | Apply CDD on an occasional transaction of **at least EUR 10 000**, single or through **linked transactions** | 19(1)(b) |
| EU-CDD-3 | Apply CDD when there is a **suspicion** of ML/TF — "regardless of any derogation, exemption or threshold" | 19(1)(d) |
| EU-CDD-4 | Apply CDD when there are **doubts about the veracity or adequacy** of previously obtained identification data | 19(1)(e) |
| EU-CDD-5 | Apply CDD when there are doubts whether the person interacted with **is** the customer or is authorised to act for them | 19(1)(f) |
| EU-CDD-6 | Credit and financial institutions: apply CDD on an occasional **transfer of funds of at least EUR 1 000** (single or linked) | 19(2) |
| EU-CDD-7 | Crypto-asset service providers: full CDD at **EUR 1 000**; **identification only, below EUR 1 000** — i.e. no floor at all | 19(3) a–b |
| EU-CDD-8 | Any obliged entity: at least **identification** on an occasional **cash** transaction of **EUR 3 000** or more (single or linked) | 19(4) |
| EU-CDD-9 | CDD content: identify and verify the customer; identify BOs and take reasonable measures to verify, to the point of understanding the ownership and control structure; understand purpose and intended nature; **screen customer and BOs against targeted financial sanctions**, including control or **>50 %** of proprietary rights of a legal entity; understand the nature of the customer's business/occupation; **ongoing monitoring**; determine **PEP / family member / close associate** status; identify natural persons a transaction is conducted for; verify any representative's authority | 20(1) a–i |
| EU-CDD-10 | Before entering a relationship or performing an occasional transaction, **assure yourself you understand its purpose and intended nature**, obtaining where necessary: economic rationale, **estimated amount of envisaged activity**, source of funds, **destination of funds**, business activity/occupation | 25 |

EU-CDD-10 is the AMLR's version of the "expected volume at contract" the challenge's rule A compares against — and it makes the *estimated amount* an explicit collection item rather than an inference.

### 4.2 Ongoing monitoring — the new explicit duty

| ID | Rule | Article |
| --- | --- | --- |
| EU-MON-1 | Conduct ongoing monitoring of relationships **and transactions** so they stay consistent with knowledge of the customer, their business activity and **risk profile**, and where necessary with information on the **origin and destination of funds**, in order **to detect those transactions to be made subject to a more thorough assessment under Art. 69(2)** | 26(1) |
| EU-MON-2 | Where a relationship spans several products or services, CDD must cover **all** of them | 26(1) |
| EU-MON-3 | Where group entities share a customer, take into account information from **those other relationships** when monitoring | 26(1) |
| EU-MON-4 | Keep customer data up to date, with a **hard refresh ceiling: 1 year for higher-risk customers, 5 years for all others** | 26(2) a–b |
| EU-MON-5 | Also review and update on a **change in relevant circumstances**, on a legal obligation to contact the customer in the calendar year, or on becoming aware of a relevant fact | 26(3) a–c |
| EU-MON-6 | **Regularly re-verify sanctions status**; for credit and financial institutions, also **on every new designation** | 26(4) |

EU-MON-1 is the first time EU-level text names the alerting step itself as the object of a legal duty, and ties it by cross-reference to the assessment in Art. 69(2). A monitoring system is no longer only an implementation detail of "ongoing monitoring" — it is the thing Art. 26(1) requires.

### 4.3 The scenario layer — what replaces §6(1)

There is **no §6-style list in the AMLR**. Four things stand in for it:

| ID | Rule | Article |
| --- | --- | --- |
| EU-EDD-1 | **Examine the origin and destination of funds and the purpose** of all transactions meeting at least one of: **(a) complex in nature; (b) unusually large; (c) conducted in an unusual pattern; (d) no apparent economic or lawful purpose** | 34(2) |
| EU-EDD-2 | Take into account at least the **higher-risk factors in Annex III**, AMLA guidelines under Art. 32, **FIU notifications**, and the business-wide risk assessment | 34(3) |
| EU-RPT-SRC | A suspicion must be based on the **characteristics of the customer and their counterparts**, the **size and nature** of the transaction, its **methods and patterns**, the **link between several transactions**, the **origin, destination or use of funds**, or any other circumstance, **including consistency with the customer's risk profile** | 69(2) |
| EU-GL-1 | **By 10 July 2027 AMLA shall issue guidelines on indicators of suspicious activity or behaviours**, periodically updated | 69(5) |

Art. 34(2) is a **mandatory examination trigger**, not an alerting trigger — it says what must be investigated, not what must be detected. Its four limbs are nonetheless the closest thing the AMLR has to named scenarios, and they line up with the challenge ruleset: (b) and (d) with rule A, (c) and (d) with rule C.

Annex III higher-risk factors relevant to transaction monitoring:
- **Customer:** relationship or transaction conducted in **unusual circumstances**; resident in a higher-risk geography; **personal asset-holding vehicles**; nominee shareholders or bearer shares; **cash-intensive businesses**; ownership structure **unusual or excessively complex** for the business; investor-residence applicants; entity created in a jurisdiction where it has **no real economic activity or apparent economic rationale**, or owned by such an entity.
- **Product/channel:** private banking; products favouring **anonymity**; **payment received from unknown or unassociated third parties**; new technologies; transactions in oil, arms, precious metals/stones, tobacco, cultural artefacts, ivory, protected species.
- **Geography:** third countries under **FATF increased monitoring** or identified by it for compliance weaknesses; identified by credible sources as lacking effective AML/CFT systems; with **significant corruption**; under **EU or UN sanctions or embargoes**; funding or supporting terrorism; **enabling financial secrecy** (barriers to cooperation, strict secrecy laws, weak entity-formation controls, no central BO register).

"Payment received from unknown or unassociated third parties" plus "cash-intensive businesses" is the Annex III pairing that most directly describes rule C.

### 4.4 High-risk jurisdictions — three tiers instead of one

| ID | Rule | Article |
| --- | --- | --- |
| EU-GEO-1 | **High-risk third countries** — significant strategic deficiencies, persistent, unremedied. The Commission designates by delegated act **within 20 calendar days** of ascertaining the criteria. Obliged entities **shall apply the EDD measures of Art. 34(4)**, and the delegated act names the **specific countermeasures** from Art. 35 per country. | 29 |
| EU-GEO-2 | **Countries with compliance weaknesses** — a lower tier. The delegated act identifies **which specific** Art. 34(4) EDD measures apply. | 30 |
| EU-GEO-3 | **Countries posing a specific and serious threat** to the Union's financial system that Arts. 29 and 30 cannot mitigate. | 31 |
| EU-GEO-4 | A Member State may require **additional countermeasures** for an Art. 29/30 country, notifying the Commission **within 5 days** of application | 29(6) |
| EU-GEO-5 | By 10 July 2027 AMLA shall issue guidelines on ML/TF **risks, trends and methods** per geographical area outside the Union, reviewed **at least every 2 years** | 32 |

This is the structural change for the challenge's **rule B**. Today "high-risk third country" is one binary list. From 2027 it is three tiers, each carrying a *different, individually specified* EDD package rather than a uniform one — so rule B stops being a boolean and becomes a lookup returning a measure set.

### 4.5 EDD and PEPs

| ID | Rule | Article |
| --- | --- | --- |
| EU-EDD-2 | Apply EDD in the Art. 29, 30, 31 and 36–46 cases **and** in other higher-risk cases the entity itself identifies | 34(1) |
| EU-EDD-3 | EDD menu: additional information on customer and BOs; on the intended nature of the relationship; on **source of funds and source of wealth**; on **the reasons for the intended or performed transactions and their consistency with the relationship**; **senior management approval**; **enhanced monitoring by increasing the number and timing of controls and selecting transaction patterns needing further examination**; first payment through an account in the customer's name | 34(4) a–g |
| EU-EDD-4 | **Wealth-management trigger:** a higher-risk relationship handling assets of at least **EUR 5 000 000** through personalised services for a customer holding total assets of at least **EUR 50 000 000** attracts specified additional measures | 34(5) |
| EU-PEP-1 | For PEPs: **senior management approval** for the occasional transaction or for establishing **or continuing** the relationship; adequate measures to establish **source of wealth and source of funds**; **enhanced ongoing monitoring** | 42(1) a–c |
| EU-PEP-2 | On ceasing to hold the function, continue to account for the residual risk and apply **one or more Art. 34(4) measures** until the risk ends, and **in any case for not less than 12 months** | 45(1)–(2) |
| EU-PEP-3 | The same applies to **family members and known close associates** | 46 |
| EU-PEP-4 | For life/investment insurance, determine whether the **beneficiary or their BO** is a PEP, no later than payout or assignment; on higher risk, **inform senior management before payout** and conduct enhanced scrutiny of the whole relationship | 44 |
| EU-CORR-1 | Cross-border correspondent relationships with a third-country respondent: gather sufficient information on the respondent, **assess its AML/CFT controls**, obtain **senior management approval**, document responsibilities, and for payable-through accounts be satisfied the respondent verified and monitors the customers with direct access. Document any AML-driven termination. | 36 |
| EU-CORR-2 | **Prohibition:** no correspondent relationship with a **shell institution**, and take measures against dealing with institutions known to let shell institutions use their accounts | 39 |
| EU-RBI-1 | For investor-residence applicants, apply **at minimum** Art. 34(4)(a), (c), (e) and (f) | 41 |

### 4.6 Beneficial ownership

| ID | Rule | Article |
| --- | --- | --- |
| EU-BO-1 | A BO is a natural person who has an ownership interest in, or controls, the entity — **control via other means is assessed independently of and in parallel to ownership** | 51 |
| EU-BO-2 | Ownership interest = direct or indirect ownership of **25 % or more** of shares, voting rights or other ownership interest; indirect ownership is **multiplied down each chain and summed across chains** | 52(1) |
| EU-BO-3 | Control through ownership interest = **50 % plus one** of shares or voting rights | 53(2)(c) |
| EU-BO-4 | Control via other means includes majority voting rights, the right to appoint/remove a board majority, relevant veto or decision rights | 53(3) |
| EU-BO-5 | Report **discrepancies** against BO registers | 24 |
| EU-BO-6 | By 10 July 2030 the Commission reports on whether to **lower the 25 % threshold** | 88(a) |

### 4.7 Blocking, reporting and the hold

| ID | Rule | Article |
| --- | --- | --- |
| EU-BLK-1 | Where CDD under Art. 20(1) **cannot be complied with**: refrain from the transaction, do not establish the relationship, **terminate** an existing one, **and consider reporting** a suspicious transaction | 21(1) |
| EU-RPT-1 | Report to the FIU **promptly**, on own initiative, where the entity **knows, suspects or has reasonable grounds to suspect** that funds or activities — **regardless of the amount** — are proceeds of criminal activity or related to terrorist financing | 69(1)(a) |
| EU-RPT-2 | **All** suspicious transactions must be reported, **including attempted transactions** and **suspicions arising from the inability to conduct CDD** | 69(1) |
| EU-RPT-3 | Answer FIU information requests within **5 working days**; the FIU may shorten this, **including to under 24 hours**, in justified and urgent cases, and may extend it | 69(1) |
| EU-RPT-4 | **Prioritise** the assessment of transactions by the **urgency of the transaction** and the risks affecting the Member State of establishment | 69(2) |
| EU-HOLD-1 | **Refrain** from carrying out a transaction known or suspected to relate to proceeds of crime or terrorist financing **until** the report has been submitted and any further FIU instructions complied with. The transaction may be carried out, **after assessing the risk of proceeding**, if no contrary instruction arrives **within 3 working days** of the report. | 71(1) |
| EU-HOLD-2 | Where refraining is impossible, or would be likely to frustrate pursuit of the beneficiaries, **inform the FIU immediately after** carrying out the transaction | 71(2) |

### 4.8 Automated decisions — the rule that constrains the triage engine itself

| ID | Rule | Article |
| --- | --- | --- |
| EU-AI-1 | Automated processing, **profiling and AI systems** may be used, provided the data processed is **limited to data obtained under Chapter III** | 76(5)(a) |
| EU-AI-2 | Any decision **to enter, refuse to enter or maintain a relationship**, **to carry out or refuse an occasional transaction**, or **to increase or decrease the extent of CDD measures**, is subject to **meaningful human intervention** | 76(5)(b) |
| EU-AI-3 | The customer **may obtain an explanation** of the decision and **may challenge it** — **except in relation to an Art. 69 report** | 76(5)(c) |
| EU-AI-4 | Processing of AML personal data **for commercial purposes is prohibited** | 76(4) |
| EU-AI-5 | Where special-category or criminal-offence data is processed: inform customers, use reliable, accurate, up-to-date sources, **do not take decisions leading to biased or discriminatory outcomes**, apply high security, and distinguish allegations from investigations, proceedings and convictions | 76(2)–(3) |

Art. 76(5)(b)'s list is the one to read carefully for the build: **alert triage is not on it**, but *changing the CDD level* is, and so is refusing a transaction. An alert that terminates in "close, no action" is unlisted; an alert that terminates in EDD, a restriction or an exit falls squarely inside it and must carry a human decision. (Same reading as the companion note.)

### 4.9 Records and cash

| ID | Rule | Article |
| --- | --- | --- |
| EU-REC-1 | Retain: CDD documents and information; **the record of the Art. 69(2) assessment — the information and circumstances considered and the result — whether or not it led to a report**, plus the report itself; supporting evidence and transaction records; information-sharing-partnership records | 77(1) a–d |
| EU-REC-2 | Records **must not be redacted** | 77(1) |
| EU-REC-3 | Retention period is **5 years** from the end of the relationship, the occasional transaction, or the **refusal** to enter/carry out; then **delete the personal data** | 77(3) |
| EU-REC-4 | Competent authorities may require further retention **case by case**, capped at a further **5 years** | 77(3) |
| EU-CASH-1 | Persons trading in goods or providing services may accept or make cash payments only up to **EUR 10 000**, single or **in several operations that appear linked** | 80(1) |
| EU-CASH-2 | Member States may set **lower** limits (ECB consultation, Commission notification within 3 months); **existing lower national limits continue** and were to be notified by 10 October 2024 | 80(2)–(3) |
| EU-CASH-3 | Exempt: payments between natural persons **not acting professionally**; payments or deposits **at the premises of credit institutions, e-money issuers and PSPs** — but such deposits **above the limit must be reported to the FIU** within the FIU's deadlines | 80(4) |

EU-REC-1(b) is the AMLR analogue of CZ-REC-3 and is, if anything, more explicit: the record of the assessment is retained **whether or not** it produced a report. Negative triage outcomes are a retention object by name.

---

## 5. The delta that matters

| Topic | Today (Act 253/2008) | From 10 July 2027 (AMLR) | Direction |
| --- | --- | --- | --- |
| Occasional-transaction CDD | **EUR 15 000** (§9(1)(a)(1)) | **EUR 10 000** (Art. 19(1)(b)) | Tightens |
| Generic identification floor | **EUR 1 000** (§7(1)) | **No generic floor.** Replaced by EUR 3 000 cash (19(4)), EUR 1 000 transfers (19(2)), EUR 1 000 / zero crypto (19(3)) | Restructured |
| Linked transactions | Not spelled out in the thresholds | **Explicit** in 19(1)(b), 19(2), 19(3), 19(4), 80(1) | Tightens |
| Suspicion catalogue | **Demonstrative statutory list, §6(1) a–j** | **None.** Art. 34(2) examination triggers + Annex III + Art. 69(2) + AMLA guidelines due 10 Jul 2027 | Moves from statute to supervisory guidance |
| Sanctions hit | **Automatically suspicious**, §6(2) | Sanctions screening is a **CDD element** (20(1)(d)) and a geographic risk factor; **no equivalent automatic-suspicion rule** | Loosens on its face — but national sanctions law and Art. 69(1) still bite |
| High-risk jurisdiction | **One list**, uniform mandatory EDD package (§9a(2)(a)–(b), §9a(4)) | **Three tiers** (29/30/31), each with **country-specific** EDD and countermeasures named in the delegated act | Restructured; rule B becomes a lookup |
| PEP approval | **Board member or their AML delegate** (§9a(3)(d)) | **Senior management** (42(1)(a)) | Loosens the seniority requirement |
| PEP residual period | **≥ 12 months** (§4(8)) | **≥ 12 months** (45(2)) | Unchanged |
| PEP with unknown source of funds | **Transaction prohibited outright** (§15(2)) | **No equivalent prohibition.** Source of funds is an EDD measure (42(1)(b)) | **Loosens — a real loss of a bright-line rule** |
| Attempted transactions | Not named in §18 | **Expressly reportable** (69(1)) | Tightens |
| Reporting deadline | "Without undue delay"; immediately if risky — **no day count** | "**Promptly**" — still no day count | Unchanged in substance |
| Answering the FIU | Deadline set by FAÚ ad hoc (§24(1)) | **5 working days**, shortenable to under 24 h, extendable | Codified |
| Hold on the order | **24 h** from FAÚ receipt, +2 wd extension, or 3 wd freeze order, +3 wd on criminal complaint (§20) | **3 working days** from the report, lapsing into permission to proceed **after a risk assessment** | Simplified; the initial hold lengthens, the escalation ladder disappears |
| Retention | **10 years** (§16) | **5 years**, extendable case-by-case by up to 5 (77(3)) | **Halves** |
| Historic-relationship lookup | **10-year** answerability with a required system (§24(3)) | No equivalent in the AMLR | Lost (likely to resurface via AMLD6 / national law) |
| Record of a *non-report* | Required (§16(1)(f)) | Required and **more explicit** (77(1)(b)) | Tightens |
| Monitoring-system duty | Implicit in §9(2)(d) and Decree 67/2018 | **Explicit** (26(1)), with **refresh ceilings of 1 / 5 years** (26(2)) | Tightens |
| Automated decisions | No AML-specific rule | **Meaningful human intervention** + explanation + challenge right (76(5)) | New constraint |
| Cash limit | **CZK 270 000** (Act 254/2004) | **EUR 10 000** EU-wide (80(1)) | See the note below |
| Legal form | National statute, amendable in Prague | **Directly applicable regulation** | Loss of national drafting room |

### Two judgement calls, flagged as mine

1. **The cash limit may rise, not fall.** Art. 80(3) preserves national limits only where they are **below** EUR 10 000. CZK 270 000 is roughly EUR 11 000 at ~24.5 CZK/EUR, i.e. **above** the EU ceiling — so the EU figure would bite and the effective Czech limit would tighten to EUR 10 000. This turns on the FX rate and on how the conversion is drawn in Czech implementing law; I have not found a source resolving it. Treat as an open point.
2. **The retention conflict is unresolved.** Art. 77(3) sets 5 years and orders deletion of personal data on expiry; §16 sets 10. A regulation does not leave room for a longer national period by default, but Art. 77(3) second subparagraph permits case-by-case extension, and AMLD6 may carry a national hook. This is the same open point as in the companion note, and it is **not** resolved here.

### Not verified

- A new Czech **"zákon o ekonomické ochraně státu"** is reported to be planned, absorbing Act 253/2008, the central account register act and Act 254/2004, alongside a new FAÚ act. **Single secondary source (a search summary), not confirmed in any legislative tracker.** Do not state this as fact in the write-up.
- AMLD6 (2024/1640) transposition deadlines and the fate of §24(3)-style national obligations — **not read**.
- Decree 67/2018 Sb. operative text — **not read for this note**; its monitoring and record-content requirements are summarised in the companion note.
- FAÚ Methodological Guideline No. 4 on OPO (reported ref. FAU-121182/2025/03, effective 30 Aug 2025) — the PDF has no extractable text layer and **could not be read**. It is the most likely source of a practical Czech typology catalogue and should be opened by hand before the write-up leans on it.
- Act 69/2006 Sb. (international sanctions) — reached only through the §6(2) cross-reference.
- Regulation 2023/1113 (travel rule) thresholds — **secondary sources only**.

---

## 6. What this means for the build

The challenge's three rules sit on **today's** set, and both sets support them — but the justification text differs:

| Challenge rule | Today's citation | 2027 citation |
| --- | --- | --- |
| **A — client profile discrepancy** | §6(1)(b), (d), (e); §9(2)(d) | Art. 26(1), 34(2)(b)+(d), 69(2) |
| **B — high-risk jurisdiction / PEP** | §6(1)(h); §9(1)(a)(2)–(3); §9a(2); **§15(2)** | Art. 29/30/31, 34(4), 42(1), 45(2) |
| **C — flow-through account** | **§6(1)(a)** (near-verbatim), (d), (f) | Art. 34(2)(c)+(d), Annex III(2)(c), 69(2) |

Three things follow for the code:

1. **Thresholds belong in a dated, swappable config**, not in rule bodies. The same rule A with `15 000` versus `10 000`, and the same retention with `10y` versus `5y`, is the entire difference between the two regimes. A `regime: "cz-2026" | "amlr-2027"` key over a threshold table gives both answers from one engine — and is a two-minute demo.
2. **Rule C already has a near-verbatim statutory citation today** (§6(1)(a): withdrawals or transfers to other accounts immediately after cash deposits). That is the strongest reason text available for any of the three rules, and it should appear in the `reason` field verbatim.
3. **The 2027 reason text has to cite differently, not just more.** Under the AMLR there is no §6-style list to quote, so an alert's justification has to be built from the Art. 69(2) characteristics (customer and counterparts, size and nature, methods and patterns, link between transactions, origin/destination of funds, consistency with risk profile). That list is a good schema for the `reason` field under **both** regimes — it is a superset of what §6 needs.

The one rule to make unconditional in code today and **re-check in 2027** is **§15(2)**: no transaction with a PEP where the origin of funds is unknown. It has no AMLR successor.

---

## 7. The starter set — rules this app can actually enforce in code

Sections 3–4 are the legal picture. This section is the **build contract**: the subset that is (a) traceable to a §/Article, (b) evaluable on the **actual ČNB columns**, and (c) inside this app's scope (alert generation → triage → escalation → audit log).

### 7.1 The filter, and what it removes

The app sees 12 client columns and 11 transaction columns ([data-profile.md](data-profile.md)). It has **no onboarding flow, no payment execution, no client-facing surface**. That removes most of the threshold register at a stroke:

| Excluded | Why | Thresholds lost |
| --- | --- | --- |
| **All CDD / identification gates** (§7, §9, §13a, §14; Art. 19, 33) | The app never onboards a client or performs CDD. There are no CDD events in the dataset. | T1–T14, E1–E8 — **22 of the ~58** |
| **§6(2) sanctions auto-suspicion** | Counterparty accounts are **anonymised** and there are no names. The `MostlyRIght/` sanctions list cannot be joined to anything in `CNB/`. | — |
| **§15(2) PEP + unknown source of funds** | **No source-of-funds field exists.** Enforced literally it would block all 1,660 transactions of all 23 PEP clients — a nonsense system behaviour. Downgraded to INV-6 below. | — |
| **§9(2)(b)–(c) beneficial owner / ownership structure** (Art. 51–55, the 25 % and 50 %+1 tests) | No BO or ownership data in the dataset. | E12–E14 |
| **§20 the 24-hour hold** (Art. 71's 3 working days) | The app does not execute payments, so it cannot withhold one. Representable as a **state deadline**, not a block. | T18–T21, E17 |
| **Approver ≠ relationship manager** | No RM data — and legally **UNVERIFIED** in CZ/EU primary sources anyway ([czech-aml-escalation.md](czech-aml-escalation.md) §3). | — |
| **Cash, cash-transport, high-value-goods limits** (§41, §41a, Act 254/2004; Art. 80, Annex IV) | No cash or goods transactions in a payment-transfer dataset. | T26–T28, E28, E30 |
| **Entity-governance obligations** — 60 days to establish the internal-policy system and risk assessment (§21(2), §21a(2)); 30/15 days to notify the contact person (§22(2)); **annual staff training (§23)**; the 10-year relationship-lookup capability (§24(3)) | These bind **the bank as an institution**, not an alert. The app has no staff, no supervisor correspondence, and is not the system of record for client relationships. Nothing here is evaluable on an alert row. | **T22–T25**, E22–E24, E29 |

**What survives is ~12 invariants, and only three of them carry a statutory number.** The rest are *structural* invariants — constraints on the shape of a decision, not on an amount. That is the honest shape of this problem: the law governs **how an alert is decided and recorded**, not **when one fires**.

### 7.2 The invariants

Each is a check that can fail a build or reject a row. `A` = alert, `C` = client record.

| ID | Invariant | Check | Basis | Kind |
| --- | --- | --- | --- | --- |
| **INV-1** | No alert is decided without a decision log | `A.triage ∈ {FP, REVIEW}` ⇒ `A.reason` non-empty **and** `A.log` non-empty | §16(1)(f); Art. 77(1)(b); challenge req. 1 | Structural |
| **INV-2** | A **false positive** carries its reasoning too | `A.triage == FP` ⇒ `A.reason` cites ≥1 basis from the enum {client profile, history, AML risk score, client type, relationship specifics} and ≥1 numeric feature value. A bare "OK" is rejected. | §16(1)(f) retains the assessment **whether or not** it led to a report; Art. 77(1)(b) is explicit. ČNB's named finding is a bare "OK". | Structural |
| **INV-3** | Reason is reconstructable | `A.reason` contains the rule id **and the values that triggered it** (e.g. `daily=412k > 3× avg=98k`) | §9(3) justify proportionality; ČNB benchmark (reason must be reconstructable afterwards) | Structural |
| **INV-4** | Log answers who / what / when / on what basis / with what result | `A.log` entries are structured `{actor, action, timestamp, basis: {ruleId, citedFeatures}, result}` | Decree 67/2018 §18(3) | Structural |
| **INV-5** | **A PEP alert is never auto-closed** | `C.PEP == yes` ⇒ `A.triage == REVIEW` | §9a(2)(c) + §9a(4): EDD is mandatory, minimum measures include board-level approval. Art. 42(1) | Structural |
| **INV-6** | A PEP alert demands an explicit source-of-funds finding | `C.PEP == yes` ⇒ the reviewer checklist carries a required `sourceOfFunds: known \| unknown` field; `unknown` forces escalation, never FP | §15(2), degraded to a checklist because the field does not exist in the data. **Label this as a degradation in the write-up.** | Structural |
| **INV-7** | **A high-risk-jurisdiction alert is never auto-closed** | country(client\|payer\|payee) ∈ highRiskList ⇒ `A.triage == REVIEW` | §9a(2)(a)–(b) + §9a(4) | Structural |
| **INV-8** | 4-eyes: the approver is not the preparer | `A.triage == REVIEW` ⇒ `A.approver` and `A.executive_person` both non-empty **and** `A.approver != A.executive_person` | Decree 67/2018 — separation of incompatible functions | Structural |
| **INV-9** | A continuing PEP relationship needs board-level approval | `C.PEP == yes` ⇒ `roleOf(A.approver) ∈ {board AML member, delegate}` | §9a(3)(d) + §9a(4). **Changes under AMLR** → "senior management" (Art. 42(1)(a)) | Structural |
| **INV-10** | The detecting analyst is not named in the report export | The OPO export omits `detected_by`; the **internal** log retains it | §18(3) — "v oznámení se neuvádí údaje o zaměstnanci … která podezřelý obchod zjistila" | Structural, **negative** |
| **INV-11** | A restricting outcome is never model-final | `A.outcome ∈ {escalate-to-EDD, restrict, exit}` ⇒ `A.decidedBy.kind == human` | **AMLR Art. 76(5)(b)** — meaningful human intervention. *No equivalent today; forward-looking.* | Structural |
| **INV-12** | Auto-closure only for the no-indicator case | auto-FP permitted only when `C.riskScore == low` **and** `!C.PEP` **and** no high-risk country **and** the client has exactly one flag | **AMLA draft monitoring guidelines para 78 — guidance, not law.** Label as such. | Structural |
| **INV-13** | Every alert carries a retention stamp | `A.retainUntil = decisionDate + regime.retention` | §16 → **10 years**; Art. 77(3) → **5 years** | **Numeric** |
| **INV-14** | PEP treatment survives loss of office | PEP measures apply ≥ **12 months** after the function ends | §4(8); Art. 45(2) — **identical in both regimes**. *Not evaluable on this data (no office-end date) — carry as config, flag as unexercised.* | **Numeric** |
| **INV-15** | FAÚ response capability | Answer an information request within the configured SLA | §24(1) sets no number → **our policy**. Art. 69(1) sets **5 working days**. | **Numeric (2027 only)** |

### 7.3 What changes on the regime switch

Only four invariants move, which is what makes the `regime` toggle a clean demo:

| Invariant | `cz-2026` | `amlr-2027` |
| --- | --- | --- |
| INV-9 approver seniority | Board AML member or delegate (§9a(3)(d)) | Senior management (Art. 42(1)(a)) — **less strict** |
| INV-11 human intervention | Not required by law | **Required** (Art. 76(5)(b)) |
| INV-13 retention | **10 years** (§16) | **5 years** (Art. 77(3)) |
| INV-15 FIU response SLA | Our policy (no statutory number) | **5 working days** (Art. 69(1)) |

INV-1 to INV-8, INV-10, INV-12 and INV-14 are **unchanged across both regimes** — they are the stable core to build first.

### 7.4 Build order

1. **INV-1, INV-2, INV-3, INV-4** — the log and reason schema. Everything else is scored on these (decision justification is 25 % of the FINREG weighting, audit log another 15 %). Zod refinements on the alert row; a validation pass over the CSV before it is written.
2. **INV-5, INV-7, INV-8** — the three no-auto-close / 4-eyes gates. Cheap, and they directly serve the 20 % escalation-correctness weighting.
3. **INV-9, INV-10, INV-12** — role predicates and the auto-closure gate; needs the roster model, which waits on the briefing's escalation matrix.
4. **INV-13, INV-11, INV-15** — the regime-switch set. Build last, demo first.
5. **INV-6, INV-14** — degraded or unexercised; carry them as explicit, labelled stubs rather than silently dropping them.

### 7.5 The honest caveats to keep in the write-up

- **The A/B/C thresholds are FINREG's, not the law's** (§2.1). Nothing in §6 or Art. 34(2) supplies 25 %, 3×, 2×, CZK 10 000, CZK 100 000, 80 %, 24 h or 6 h.
- **INV-7 fires zero times** on the July 2026 lists — no country in the data is listed ([data-profile.md](data-profile.md) finding 1). Keep the invariant; report the zero rather than hiding it.
- **INV-6 is a degradation** of §15(2), not an implementation of it.
- **INV-12 rests on draft guidance**, consulted June 2026 — not on binding law.
- **Sanctions screening (§6(2)) is unimplementable here** and should be stated as a known gap, not quietly omitted. It is the only *closed, automatic* suspicion rule in Czech law, so its absence is worth naming.

---

## Sources

Primary, read in full text:

1. [Act 253/2008 Sb.](https://www.zakonyprolidi.cz/cs/2008-253) — consolidated version 32, in force 11 Jan 2026 (zakonyprolidi.cz; not checked against Sbírka zákonů)
2. [Regulation (EU) 2024/1624 (AMLR)](https://eur-lex.europa.eu/eli/reg/2024/1624/oj/eng) — OJ L series, 19.6.2024; text retrieved from the Publications Office cellar store (`cellar/868bf3cf-2dd4-11ef-a61b-01aa75ed71a1`, XHTML rendition) because EUR-Lex serves a bot challenge

Secondary / not read in primary text:

3. [Decree 67/2018 Sb. (ČNB)](https://www.zakonyprolidi.cz/cs/2018-67)
4. [Act 254/2004 Sb. on limiting cash payments](https://www.zakonyprolidi.cz/cs/2004-254) — CZK 270 000 figure via [epravo](https://www.epravo.cz/top/clanky/limity-pro-hotovostni-platby-a-vyjimky-112562.html)
5. [FAÚ Methodological Guideline No. 4 (OPO)](https://fau.gov.cz/assets/cs/cmsmedia/Metodick%C3%A9%20pokyny/metodika-c-4-opo.pdf) — PDF has no text layer; **not read**
6. [FAÚ Methodological Guideline No. 9 (kontrola klienta)](https://fau.gov.cz/assets/cs/cmsmedia/Metodick%C3%A9%20pokyny/mp-c-9-kontrola-klienta.pdf), [No. 11 (risk assessment and internal policies)](https://fau.gov.cz/assets/cs/cmsmedia/Metodick%C3%A9%20pokyny/mp-c-11-hodnoceni-rizik-a-system-vnitrni.pdf) — not read
7. [Regulation (EU) 2023/1113 (travel rule)](https://anti-money-laundering.eu/travel-rule/) — thresholds via secondary sources
8. [epravo: from Act 253/2008 to the AMLR — what a Czech obliged entity must change by 2027](https://www.epravo.cz/top/clanky/aml-od-zakona-c-2532008-sb-k-amlr-co-konkretne-musi-ceska-povinna-osoba-zmenit-do-roku-2027-121304.html)
9. [Deloitte: the EU AML package](https://www.deloitte.com/global/en/services/consulting/perspectives/the-eu-aml-package.html)
