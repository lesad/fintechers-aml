# AML alert escalation: Czech roles, AMLR, 4-eyes, AI (2026-10-19)

Not legal advice. Statute text read on zakonyprolidi.cz (consolidated versions), not checked against Sbírka zákonů.

## 1. Czech roles and FAÚ path (Act 253/2008, Decree 67/2018)

| Czech term                          | English                                            | Basis             |
| ----------------------------------- | -------------------------------------------------- | ----------------- |
| pověřený člen statutárního orgánu   | board member responsible for AML                   | §22a Act [1]      |
| kontaktní osoba                     | contact person (reports to FAÚ, daily FAÚ contact) | §22 Act [1]       |
| kontrolor dodržování předpisů (AML) | AML compliance officer                             | §16(2) Decree [2] |
| oznámení podezřelého obchodu (OPO)  | suspicious transaction report                      | §18 Act [1]       |
| odklad splnění příkazu klienta      | postponing the client's order                      | §20 Act [1]       |

- **Contact person limits.** At a credit institution the contact person may not be a board member, unless justified. It also may not be someone who concludes or settles trades, or works in internal audit. The contact person must be able to reach the board directly [1].
- **Deadline.** There is no day count. Report "bez zbytečného odkladu" (without undue delay), and immediately where delay is risky [1]. The 5-working-day figure in AMLR is the deadline for answering FIU information requests, not for filing [3].
- **Postponement.** The bank may execute a suspicious order no earlier than 24 hours after FAÚ receives the report, and must secure the assets. FAÚ may extend by up to 2 working days, or order up to 3 working days at the bank holding the assets [1].
- **Tipping-off.** §38 imposes confidentiality about reports and investigations [1].
- **Retention.** 10 years [1].
- **Annual report.** The board-designated person approves the annual AML evaluation report. The compliance officer prepares it or comments on it [2].

## 2. AMLR (applies 10 July 2027)

- Compliance manager: one member of the management body, accountable for compliance and for resources (Art. 11(1)). Compliance officer: appointed by the management body, files STRs to the FIU (Art. 11(2), 69(6)) [3][4].
- Report "promptly", including attempted transactions (Art. 69(1)) [3].
- Refrain from executing the transaction for 3 working days after reporting unless the FIU instructs otherwise (Art. 71). Single-source [5].
- PEPs need senior management approval (Art. 42(1)(a)) [3].
- Automated decisions to enter, refuse or maintain a relationship, or to change the CDD level, need "meaningful human intervention". The customer may get an explanation and challenge the decision, except for Art. 69 reports (Art. 76(5)) [3][6]. Alert triage is not on that list. An alert that leads to EDD, a restriction or an exit is.
- Retention is 5 years (Art. 77) [3][6], against today's Czech 10 years. Which period prevails after July 2027 is not resolved here.
- **Design change:** the same two roles map 1:1. The board member becomes the compliance manager and the reporter becomes the compliance officer. Model them as configurable roles.

## 3. Conflict of interest and 4-eyes

- The Decree requires "oddělení neslučitelných funkcí" (separation of incompatible functions) in role appointments [2].
- EBA: consult the compliance officer before senior management approves high-risk or PEP relationships. If management overrides that advice, record the decision and the mitigation (para 43) [7].
- PEP: under Czech law a board member or their delegate approves (§9a(3)(d)) [1]. Under AMLR, senior management approves [3].
- Rule that an analyst must not review a client they manage: **UNVERIFIED** in Czech or EU primary sources. The nearest is a MAS (Singapore, non-EU) finding that analysts closed alerts by accepting relationship-manager representations [8].

## 4. Alert closure record

- ČNB: every alert is checked, evaluated and closed. The closure states whether suspicion was excluded and why, plus any further measures (refusal, OPO). The ČNB calls it insufficient when the reason cannot be reconstructed afterwards, including for alerts closed without an OPO. Its typical finding is a bare "OK" [9].
- Record obstacles and the steps taken to overcome them. The investigation deadline runs from alert generation. Daily or weekly scenarios: days. Long-horizon scenarios: up to a month [9].
- The record must show who did what, when, on what basis and with what result (Decree §18(3)) [2].

## 5. AI in triage

- ČNB: rank alerts with AI where useful, but validate the training data, recalibrate, control bias, and keep decisions traceable ("self-explainable AI", not a black box) [9].
- AMLA draft monitoring guidelines (consultation 3 June 2026): tools must be explainable, tested and documented. Automated closure only for cases with no suspicious or material-risk indicators, excluding higher risk (para 78). Explainability need not mean full model interpretability (para 90) [10][11].
- FATF 2021: ML reduces false positives, but explainability is a key challenge [12]. The report is older than 3 years; the sources above confirm the direction.
- Wolfsberg: transition and validation, model risk, explainability (date UNVERIFIED) [13].
- AI Act: Annex III 5(b) covers credit scoring "with the exception of AI systems used for the purpose of detecting financial fraud" [14]. AML triage is not listed. One secondary source argues customer-level ML risk scoring could be profiling [15]. Treat that as a view, not settled law.

## 6. Recommendation (own view)

| Alert                     | Triage                                                                         | Route                                      | 4-eyes approver                                                                              | FAÚ trigger                                                        |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A profile discrepancy     | Model may auto-close only low-risk alerts with no indicators, then QA sampling | L1 analyst, then L2 AML analyst            | Second analyst outside the client's business line                                            | L2 confirms suspicion, then contact person files the OPO           |
| B high-risk country / PEP | Never auto-close                                                               | L2, then compliance officer                | Compliance officer, plus board AML member (or delegate) when the relationship is to continue | Suspicion, sanctions-adjacent hit or source of funds not explained |
| C flow-through            | Never auto-close; priority 80 or above                                         | L2, then contact person; consider §20 hold | Contact person plus compliance officer                                                       | Default to an OPO if the purpose is not documented; hold 24 h      |

- Hard rules in code: the approver differs from the preparer, has no relationship-manager link to the client, and does not work in front office or audit [1][2].
- Every decision stores the reason code, cited features and rules, the model ID and score, the human override, and timestamps.
- Show a FAÚ timer as "undue delay" SLA days, set by our own policy, not by law.

## Sources

1. https://www.zakonyprolidi.cz/cs/2008-253 (Act 253/2008, consolidated 2026-01-11)
2. https://www.zakonyprolidi.cz/cs/2018-67 (Decree 67/2018, consolidated 2024-12-30)
3. https://eur-lex.europa.eu/legal-content/EN/TXT/HTML?uri=OJ%3AL_202401624 (AMLR, 2024-06-19 OJ)
4. https://service.betterregulation.com/document/739264 (AMLR Art. 11 summary)
5. https://anti-money-laundering.eu/new-reporting-obligations-under-chapter-v-amlr (undated)
6. https://didit.me/blog/amlr-explained-eu-aml-regulation-2027 (2026-10-02)
7. https://www.eba.europa.eu/activities/single-rulebook/regulatory-activities/anti-money-laundering-and-countering-financing-1 (EBA/GL/2022/05, 2022-06-14)
8. https://www.mas.gov.sg/-/media/MAS/Regulations-and-Financial-Stability/Regulatory-and-Supervisory-Framework/Anti_Money-Laundering_Countering-the-Financing-of-Terrorism/Guidance-for-Effective-AML-CFT-Transaction-Monitoring-Controls.pdf (date not checked)
9. https://www.cnb.cz/export/sites/cnb/cs/dohled-financni-trh/.galleries/vykon_dohledu/dohledove_benchmarky/download/dohledovy_benchmark_2023_02.pdf (ČNB benchmark 2/2023, 2023-07-03, pp. 12-16)
10. https://cms.law/en/deu/legal-updates/amla-publishes-draft-guidelines-on-ongoing-monitoring-under-article-26-5-amlr (2026-08-10)
11. https://ebf.eu/sites/default/files/wpuploads/2026/09/EBF-Response-to-AMLA-Draft-GLs-on-Ongoing-monitoring.pdf (2026-09)
12. https://www.fatf-gafi.org/content/dam/fatf-gafi/guidance/Opportunities-Challenges-of-New-Technologies-for-AML-CFT.pdf (2021-07-01)
13. https://wolfsberg-group.org/resources/202 (date UNVERIFIED)
14. https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-3 (Reg. 2024/1689)
15. https://zquas.ai/article-ai-act-aml-classification.html (undated)
