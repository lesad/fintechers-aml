# AML pattern discovery for the ČNB synthetic data: research report

Researched 2026-10-19 by an agent; claims marked UNVERIFIED were not confirmed.

Date: 2026-10-19. Scope: the brief's five sub-questions. Citations `[n]` resolve to the source list at the end. "Recommendation" blocks are my own judgement, not source claims.

## Headline

- The EU framework expects monitoring to compare transactions with the customer's profile, and to cover patterns across linked transactions and networks, not only single payments: AMLR Art 26(1), Art 69(2) [1]; AMLA draft guidelines paras 34, 44, 53 [2].
- No EU-level red-flag list exists yet. AMLR Art 69(5) gives AMLA until 10 July 2027 to issue guidelines on indicators of suspicious activity [1]. Until then the usable indicator lists are national (FAÚ, ČNB), FATF and EBA.
- Alert handling: outputs are prioritised by risk. Automated closure is allowed only for cases the automated analysis finds not suspicious, never for higher-risk customers. The decision logic has to be documented and kept under human oversight by sampling (AMLA draft paras 75-79 [2]). ČNB adds that every alert closure needs a written reason, and that thresholds need an internal analysis that justifies them [6].
- Explainable unsupervised methods in practice: peer-group deviation, then simple graph degree and motif counts, then isolation forest as a discovery tool only. All of them should end up as peer-percentile thresholds written in code.
- SR 11-7 no longer exists as such. SR 26-2 (17 April 2026) supersedes SR 11-7 and SR 21-8, the BSA/AML model-risk statement [13].

## 1. Typologies detectable from these columns

| Typology                                     | Computable signal on this data                                                                         | Sources                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transit / pass-through account               | Incoming funds leave quickly in a similar amount; balance stays near zero; high volume; mostly foreign | FAÚ MP č. 9 lists exactly these traits for "tranzitní účty" [8]; FATF CEF: "rapid or immediate ... transfers of large amounts following the receipt of a funds transfer in order to empty the account" [9]                    |
| Activity soon after account opening          | High value or high frequency shortly after the contract date                                           | FATF CEF: "rapid or immediate, high or low value transactions after opening of an account, inconsistent with the purpose of the account" [9]; FAÚ: "vysoká transakční frekvence většinou krátce po otevření účtu" [8]         |
| Inconsistency with the declared profile      | July volume and count vs expected monthly volume and count, vs Q2 actuals                              | AMLR Art 26(1) and Art 69(2) [1]; AMLA draft paras 27(b), 53 [2]; FATF CEF "frequent and large transactions ... inconsistent with the account holder's economic profile" [9]; ČNB on unusual and unjustified transactions [7] |
| High-risk jurisdictions                      | Payer/payee country, or the country encoded in the account, in the high-risk list                      | FATF CEF "transfers of funds to and from high-risk money laundering jurisdictions" [9]; AMLA para 27(d) [2]                                                                                                                   |
| Linked or aggregated activity, networks      | Fan-in, fan-out, scatter-gather; clients sharing counterparties                                        | AMLA draft para 44(a)-(d): linked, repeated or aggregated behaviour; network relationships; value "accumulated, split, or transferred across multiple transactions" [2]; AMLworld pattern set [15]                            |
| Structuring / splitting                      | Clusters of amounts just below a threshold                                                             | AMLA para 44(d) [2]; SAML-D typologies "Structuring", "Smurfing" [16]; FFIEC example of deposits just under the threshold [12]                                                                                                |
| Behaviour change                             | Q2 vs July shift (dormant, then a burst)                                                               | SAML-D "Behaviour Change 1/2" typologies [16]; AMLA para 27(b) "any activity that deviates from the customer's profile" [2]                                                                                                   |
| Non-face-to-face onboarding as a risk factor | channel = distant, combined with any of the above                                                      | EBA ML/TF Risk Factors Guidelines GL/2021/02 treat non-face-to-face relationships as a risk factor [5]. Single-source here: I did not extract the exact paragraph.                                                            |
| Night-time activity, many currencies         | Share of transactions at night; distinct currencies per client                                         | UNVERIFIED as named typologies: I found no regulatory or FATF source. SAML-D models currency mismatch as a feature [17].                                                                                                      |

The 2023 FATF CEF report is still current. FATF published a follow-up cyber-enabled fraud paper on 24 February 2026, which I did not read [9]. EBA GL/2021/02 predates 2023 but is still in force; its compliance table was updated in March 2026 [5]. My assumption, not checked against a source: it is expected to be superseded by AMLA instruments once the AMLR applies (10 July 2027 [1]).

## 2. What the EU framework says about classifying, prioritising, closing and documenting alerts

**Binding text (AMLR 2024/1624, applies from 10 July 2027) [1]**

- Art 26(1): monitor transactions "to ensure that those transactions are consistent with the obliged entity's knowledge of the customer, the customer's business activity and risk profile" and to pick out those that need the Art 69(2) assessment.
- Art 69(2): suspicion "shall be based on the characteristics of the customer and their counterparts, the size and nature of the transaction or activity or the methods and patterns thereof, the link between several transactions or activities, the origin, destination or use of funds ... including the consistency of the transaction or activity with ... the risk profile of the client." This works as a ready-made feature taxonomy for the explanation each alert shows.
- Art 69(5): AMLA guidelines on indicators of suspicious activity are due by 10 July 2027.
- Art 76(5): decisions from automated processes or AI systems are allowed, provided that (a) the data comes from CDD (Chapter III), (b) decisions to enter, refuse or keep a relationship, to carry out or refuse a transaction, or to raise or lower CDD intensity get "meaningful human intervention", and (c) the customer can get an explanation and challenge the decision, except for an Art 69 report.

**AMLA draft guidelines on ongoing monitoring, Art 26(5) (consultation paper 3 June 2026; consultation closed 3 September 2026) [2][3].** These are a draft, not final. One trade-press source expects the final version in Q4 2026 [4]; I could not confirm whether it has been published.

- Para 48: rules, scenarios, thresholds, models and behavioural baselines must be "clearly defined" and take account of relevant typologies.
- Para 49: calibrate, and "document, test and record any updates to their detection logic".
- Para 50: vendor default settings are not to be used "without a documented assessment of their appropriateness".
- Paras 54-55: reference or peer groups are allowed. A deviation is still assessed against the individual customer. "The absence of a deviation at peer-group level should not, on its own, be used to dismiss risk indicators identified at individual customer level." Peer groups are not to be relied on where behaviour is inherently heterogeneous.
- Para 75: outputs are "assessed without undue delay, prioritised based on risk, and escalated". Entities must explain "how monitoring outputs were assessed, escalated and acted upon, including the documented rationale".
- Para 76: mechanisms to detect and handle backlogs of pending outputs.
- Para 78: **automated closure** only for cases that "do not indicate suspicious or unusual transactions"; never "where there are indicators of heightened risk, including in relation to higher-risk customers or situations requiring enhanced scrutiny".
- Para 79: "underlying decision logic can be understood and documented"; human oversight "including periodic validation through sampling".
- Para 82: testing and validation should rely on synthetic or anonymised data where appropriate.
- Para 84: effectiveness is not measured "solely by reference to alert, reporting volumes or to the breadth of typology coverage".
- Paras 87-90: AI and ML may be used; outputs must be reviewable and open to challenge; safeguards scale with model risk, "including risks arising from inaccuracies, biases, lack of robustness or limited transparency"; firms must be able to explain the tool to the supervisor.
- Para 94 (seen in a search snippet only, not read in full): AI outputs "should support monitoring decisions" under governance, oversight and challenge, avoiding discriminatory outcomes.

Related, UNVERIFIED: the final report on the Art 28(1) CDD RTS is reported as published on 30 September 2026 [4]. I did not read its content.

**ČNB supervisory benchmark 2/2023 on AML monitoring [6] (Czech national expectation, still the latest I found)**

- An alert's life is generation, prioritisation, investigation, closure. Prioritisation follows a risk-based approach. The investigation clock starts at generation, not when the alert is assigned. Scenarios over daily or weekly history expect processing "bezodkladně či maximálně v řádu dnů" (without delay, or within days at most).
- Closure must state whether suspicion was ruled out and why, plus any further measures (refusing the transaction, filing a suspicious transaction report). This is needed so the process can be reconstructed afterwards.
- Thresholds must be justified by an internal analytical document. ČNB's example of an imprudent setting: the largest retail transaction in a year was CZK 1,000,000 while the scenario limit was CZK 5,000,000. Limits must also reflect segment differences (SME vs large corporate) and the customer's own CDD information.
- Internal procedures must cover scenario evaluation, threshold setting, updating parameter lists (countries, products), checking the input data, alert prioritisation, and whitelisting.
- ČNB position 2019-03: an unusually complex or large transaction, or one without an apparent economic purpose, is a higher-risk factor that triggers enhanced CDD [7].

**Industry: Wolfsberg.** The 2024 statement moves from transaction monitoring to "monitoring for suspicious activity" that includes customer behaviour and attributes [10]. Part II (August 2025) sets out three pillars: transition and validation, model risk balanced against financial-crime risk, and explainability. On explainability, investigators must see "why an alert was generated", for example "the features that influence the model output ... and/or the relevant risk indicators" [11].

## 3. Unsupervised methods, judged on how cleanly they convert to rules

| Method                                                                            | Explainability / rule conversion                                                                                                                                                                           | Evidence                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peer-group analysis (segment, then z-score or percentile against peers)           | Best fit. The output is already a rule: "metric > P99 of segment". AMLA explicitly allows it [2]; ČNB expects segment-specific limits [6].                                                                 | Bolton & Hand proposed PGA and noted it can be applied to money laundering [20]. Practical caveat: peer groups contaminated by the anomaly itself, and peer-group quality varies [21].                                                                    |
| Graph degree and motifs (fan-in, fan-out, scatter-gather, gather-scatter, cycles) | Converts directly to count rules, e.g. "≥k distinct payers in 24h".                                                                                                                                        | AMLworld defines fan-in and fan-out as ≥2 distinct counterparties and lists 8 patterns [15]. AMLA para 44(c) network relationships [2].                                                                                                                   |
| Isolation forest                                                                  | Weak by itself; "tells you that something is strange but not why". Use DIFFI or SHAP feature importance, or fit a shallow decision tree on the IF score, then read the splits off as candidate thresholds. | DIFFI (Carletti et al., 2023) [22]. Surrogate tree on the anomaly score, and a warning that surrogate and SHAP importances "agreed only roughly, and sometimes disagreed wildly" [23]. Both are single, non-AML sources; treat as practice, not evidence. |
| Clustering of client behaviour vectors                                            | Medium. Useful for building peer groups when the static segments (type × risk × channel) turn out heterogeneous (AMLA para 55) [2].                                                                        | Jensen & Iosifidis review: few AML studies use outlier detection; unsupervised studies often lack evaluation [19].                                                                                                                                        |
| Benford's law                                                                     | Low value here. It needs data spanning several orders of magnitude, and bounded or capped ranges break it [24]. Generated amounts may break it for generator reasons, not laundering.                      | No AML-specific primary source found. UNVERIFIED for AML.                                                                                                                                                                                                 |

Known limitation of the whole family: anomaly approaches assume suspicious equals rare within the peer group, which does not hold when laundering is common inside a segment [26].

## 4. Recipe: discover patterns, turn them into rules, validate

Source-backed steps:

1. Document every threshold with the analysis behind it [6][12]. FFIEC: "Management should document and be able to explain filtering criteria, thresholds used, and how both are appropriate for the bank's risks", and periodically test them [12].
2. Set segment-specific limits [6], derived from the observed distribution. ČNB's counter-example (limit five times above the largest real transaction) shows the test: is the threshold anchored in the data? [6]
3. Above-the-line / below-the-line (ATL/BTL) testing: move the threshold up and down (e.g. ±10%, ±20%) and review samples of what appears and disappears [25] (vendor source, no regulator definition found). Regulators require periodic testing [2 para 81][12] but do not name ATL/BTL.
4. Random ex-post samples of all transactions, not only alerted ones, to test the system [5 GL 4.75].
5. Record every logic change (AMLA para 49) and validate beyond comparison with legacy output (para 85) [2].

Model risk: SR 26-2 replaced SR 11-7 and SR 21-8 on 17 April 2026 and applies the same principles: conceptual soundness, outcomes analysis, ongoing monitoring [13]. One blog says generative and agentic AI are outside its formal scope (footnote 3) [14], single-source. For an EU entry, cite AMLA paras 87-90 [2] and AMLR Art 76(5) [1] instead.

## 5. What planted typologies look like in synthetic AML data

- **AMLworld / IBM** [15]: eight patterns: fan-out, fan-in, gather-scatter, scatter-gather, simple cycle, random, bipartite, stack. Each is planted a few hundred times with 2 to 18+ nodes. Fan-in and fan-out are defined as k ≥ 2 distinct counterparties. AMLSim used a subset; AMLworld calls earlier generators "oversimplified" [15].
- **SAML-D** [16][17]: 28 typologies (11 normal, 17 suspicious), 15 graph structures, 0.1039% suspicious. The suspicious ones include structuring, smurfing, over-invoicing, deposit-send, cash withdrawal, single large transaction, and behaviour change 1/2. High-risk locations and currency mismatch are explicit features.
- **FCA (15 April 2026)** [18]: generators struggle with "behaviours that depend on sequences of activity over time". FCA chose to embed typologies "as naturally as possible" into existing synthetic accounts "rather than artificially inserting obvious transaction sequences". Implied lesson: many generators do insert them artificially, which leaves traces.

Recommendation (mine): planted signals usually leak generator parameters. Look for:

- amounts or ratios clustering exactly at rule constants: in-amounts just over CZK 100k, out/in exactly ≥0.80, gaps just under 6h or 24h;
- round amounts;
- identical time-of-day or interval patterns across unrelated clients;
- groups of clients created on the same contract date with the same profile;
- counterparties with medium degree (shared by 5-50 clients) whose clients are otherwise unrelated.

Data traps:

- The counterparty shared by 1,372 clients is almost certainly a hub (utility, employer, payroll, or a generator default). Compute the degree distribution first and exclude the top hubs before running any fan-in logic.
- Remittances have no payer account. Rule C must fall back to amount-and-time matching for them; say so in the explanation.

## Ranked signals (recommendation)

| #   | Signal                                    | Formula on these columns                                                                                                           | Typology / source                                  | Code or Jev                                                                                                       |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Pass-through ratio                        | for each incoming >CZK 100k: sum(outgoing within 6h to a different account) / incoming; also a 24h client-level `out_24h / in_24h` | Transit account [8], CEF [9], rule C               | Code                                                                                                              |
| 2   | Profile discrepancy                       | `jul_vol / expected_monthly_vol`, `jul_cnt / expected_cnt`, `jul_vol / q2_vol_monthly`; flag > segment P99                         | AMLR 26(1), 69(2) [1]; rule A                      | Code for the ratio; Jev: "Is this deviation plausible for a {type}, {channel} client with this declared profile?" |
| 3   | New-client burst                          | `days(contract_date→first July txn) ≤ 90` AND `jul_vol` > segment P95                                                              | CEF [9], FAÚ [8]                                   | Code                                                                                                              |
| 4   | Dormant then burst                        | `q2_cnt ≈ 0` (or `q2_vol` < P10) AND `jul_vol` > segment P95                                                                       | Behaviour change [16], AMLA 27(b) [2]              | Code                                                                                                              |
| 5   | Fan-in → fan-out                          | distinct payer accounts in 24h ≥ k, followed by distinct payee accounts ≥ k within 48h; hubs excluded                              | AMLworld gather-scatter [15], AMLA 44 [2]          | Code                                                                                                              |
| 6   | Medium-degree shared-counterparty cluster | counterparties with 5 ≤ distinct clients ≤ 50; clients in that set that are mostly new or distant                                  | AMLA 44(c) [2], scatter-gather [15]                | Code to detect; Jev: "Does this shared counterparty look like a common legitimate payee?"                         |
| 7   | High-risk jurisdiction exposure           | share of volume where payer/payee country, or the account-encoded country, is in the reference list; flag PEP × high-risk          | Rule B; CEF [9]                                    | Code                                                                                                              |
| 8   | Foreign-to-foreign churn                  | domestic client; foreign-in then foreign-out within 48h, ≥80% of volume                                                            | FAÚ transit "zahraniční transakce" [8]             | Code                                                                                                              |
| 9   | Peer-group outlier on max transaction     | `max_txn_jul` z-score or percentile within type × risk × channel                                                                   | AMLA 54-55 [2], ČNB segment limits [6], PGA [20]   | Code                                                                                                              |
| 10  | Sub-threshold clustering                  | count of amounts in [0.9T, T) per client, T = CZK 100k (rule C trigger); compare with the overall amount histogram                 | Structuring [12][16], AMLA 44(d) [2]               | Code                                                                                                              |
| 11  | Currency diversity                        | distinct currencies per client vs segment P99                                                                                      | UNVERIFIED typology; SAML-D currency features [17] | Code, low weight                                                                                                  |

Jev's role across all rows (recommendation, consistent with AMLA paras 78-79 [2] and AMLR 76(5) [1]): it answers the "consistent with profile / economic rationale" judgement and drafts the reasoning. It never auto-closes an alert on a high-risk or PEP client, and its probability goes alongside the code-computed facts, not in place of them.

## Sources

1. Regulation (EU) 2024/1624 (AMLR), EUR-Lex. https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1624. OJ 19 Jun 2024; applies 10 Jul 2027 (Art 90).
2. AMLA, Consultation Paper: Draft Guidelines on ongoing monitoring under Art 26(5) AMLR. https://www.amla.europa.eu/document/download/46b50078-08ed-4ab1-aea0-28b1a6085755_en. 3 Jun 2026.
3. AMLA consultation page (closed). https://www.amla.europa.eu/policy/public-consultations/consultation-draft-guidelines-ongoing-monitoring-business-relationship_en. 2026.
4. PayTechLaw, AMLA consults on guidelines for ongoing monitoring. https://paytechlaw.com/en/amla-consults-on-guidelines-for-the-ongoing-monitoring-of-business-relationships. 5 Jun 2026 (page also links later items).
5. EBA, Final Report on revised ML/TF Risk Factors Guidelines (EBA/GL/2021/02). https://www.eba.europa.eu/sites/default/files/document_library/Publications/Guidelines/2021/963637/Final%20Report%20on%20Guidelines%20on%20revised%20ML%20TF%20Risk%20Factors.pdf. Mar 2021 (compliance table updated 17 Mar 2026).
6. ČNB, Dohledový benchmark č. 2/2023 (AML monitoring). https://www.cnb.cz/export/sites/cnb/cs/dohled-financni-trh/.galleries/vykon_dohledu/dohledove_benchmarky/download/dohledovy_benchmark_2023_02.pdf. 2023.
7. ČNB, K vymezení neobvyklých a neodůvodněných transakcí (RS2019-03). https://www.cnb.cz/cs/dohled-financni-trh/legislativni-zakladna/stanoviska-k-regulaci-financniho-trhu/RS2019-03. 2019.
8. FAÚ, Metodický pokyn č. 9. https://fau.gov.cz/assets/cs/cmsmedia/Metodick%C3%A9%20pokyny/mp-c-9-16-09-2024-cista-verze.pdf. 16 Sep 2024.
9. FATF/Interpol/Egmont, Illicit Financial Flows from Cyber-Enabled Fraud, Annex A. https://www.fatf-gafi.org/en/publications/Methodsandtrends/illicit-financial-flows-cyber-enabled-fraud.html (PDF read via https://fiaumalta.org/app/uploads/2023/11/Report-on-Illicit-Financial-Flows-from-Cyber-enabled-Fraud.pdf). 9 Nov 2023.
10. Wolfsberg Group, Statement on Effective Monitoring for Suspicious Activity. https://wolfsberg-group.org/news/the-wolfsberg-group-statement-on-effective-monitoring-for-suspicious-activity. Jul 2024.
11. Wolfsberg Group, Statement on Effective Monitoring for Suspicious Activity, Part II. https://wolfsberg-group.org/resources/202. 27 Aug 2025.
12. FFIEC BSA/AML Manual, Suspicious Activity Reporting. https://bsaaml.ffiec.gov/manual/AssessingComplianceWithBSARegulatoryRequirements/04. Current online version (2026 build).
13. Federal Reserve, SR 26-2 Revised Guidance on Model Risk Management. https://www.federalreserve.gov/supervisionreg/srletters/SR2602.htm. 17 Apr 2026.
14. Fiddler AI, SR 26-2 Model Risk Management Guidance. https://www.fiddler.ai/blog/sr-26-2-model-risk-management-guidance. 2026.
15. Altman et al., Realistic Synthetic Financial Transactions for AML Models (AMLworld), NeurIPS 2023. https://arxiv.org/html/2306.16424v3. 2023 (v3 2024).
16. Oztas et al., Enhancing AML: Development of a Synthetic Transaction Monitoring Dataset (SAML-D), IEEE ICEBE 2023. https://eprints.bournemouth.ac.uk/40982/1/Full_IEEE_Dataset_Conference_Paper%20%284%29.pdf. 2023.
17. SAML-D dataset page, Kaggle. https://www.kaggle.com/datasets/berkanoztas/synthetic-transaction-monitoring-dataset-aml. n.d.
18. FCA, Research Note: Synthetic Data and Anti-Money Laundering. http://www.fca.org.uk/publication/research-notes/synthetic-data-anti-money-laundering-project-report.pdf. 15 Apr 2026.
19. Jensen & Iosifidis, Fighting Money Laundering with Statistics and Machine Learning, IEEE Access 11. https://arxiv.org/abs/2201.04207. 2023.
20. Bolton & Hand, Statistical Fraud Detection: A Review, Statistical Science 17(3). https://projecteuclid.org/journals/statistical-science/volume-17/issue-3/Statistical-Fraud-Detection-A-Review/10.1214/ss/1042727940.pdf. 2002.
21. Weston, Hand et al., Plastic Card Fraud Detection using Peer Group Analysis. https://cer.business-school.ed.ac.uk/wp-content/uploads/sites/55/2017/03/weston-hand-whitrow.pdf. Date UNVERIFIED (c. 2008).
22. Carletti, Terzi, Susto, DIFFI: Depth-based feature importance for Isolation Forest (EAAI 119). https://github.com/mattiacarletti/DIFFI. 2023.
23. Cross Validated, Feature importance in Isolation Forest. https://stats.stackexchange.com/questions/386558/feature-importance-in-isolation-forest. n.d.
24. Wikipedia, Benford's law (range assumption). https://en.wikipedia.org/wiki/Benford%27s_law. n.d.
25. Hawk AI, How rule testing tools improve AML transaction monitoring. https://hawk.ai/news-press/how-rule-testing-tools-improve-aml-transaction-monitoring. n.d.
26. Anti-Money Laundering Alert Optimization Using Machine Learning with Graphs (author UNVERIFIED). https://arxiv.org/html/2112.07508v3. 2021-2022.
