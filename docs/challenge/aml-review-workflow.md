# AML review workflow and false-positive reasons

How an alert is reviewed and closed, the reasons analysts give for a false positive, which of them justify a rule change and which never do. Researched 2026-10-20 so the team stops redoing it; the Czech roles, FAÚ reporting and the escalation matrix are in [czech-aml-escalation.md](czech-aml-escalation.md), typologies and unsupervised methods in [aml-pattern-research.md](aml-pattern-research.md). The rule suggestion eval's simulated reviewer takes its reason categories from this page.

## 1. Review flow
Alert lifecycle: generation, prioritisation, investigation, closure; the clock starts at generation [3]. Escalate complex or higher-risk alerts to senior analysts [1 §2.20]. Requests for information go through the front office and must be challenged [1 §2.21]. Independent QA samples closed alerts [1 §2.29-2.30]; some banks add maker-checker for weaker staff [1 p.16]. DNB: first-line ownership with compliance oversight; automated closure only for low-risk alerts [4]. No source makes four-eyes on closure mandatory.

## 2-3. False-positive reason taxonomy

| Category (rule) | Example FP reason | Pattern or one-off | Rule change | Evidence in the note |
|---|---|---|---|---|
| Fits declared business (A) | "Hotel group, cash deposits match turnover" [4] | Pattern if it holds across a segment | Segment or threshold recalibration, ATL/BTL-tested and documented [1 §2.6, §2.11][2] | Profile figures compared with actuals |
| Outdated KYC profile (A) | "Turnover doubled after an acquisition; profile is from 2021" | Pattern, but fixed in the data | Update the CDD profile, not the threshold [8] | New expected volume and its source |
| Documented one-off (A) | "Proceeds of a flat sale, deed attached" | One-off | None | Supporting document, corroborated [1 §2.21][2 3.2.5] |
| Payroll or supplier batch (A, C) | "Monthly payroll to the same 40 employees" | Pattern | Counterparty-pair exclusion per client, justified, time-limited, reviewed [3 p.14-15][5][6] | Counterparty identity, history, review date |
| Own account or same beneficial owner (C) | "Transfer to the client's own account at another bank" | Pattern | Exclusion only once ownership is verified | Proof of ownership; MAS flags it as a generic reason to monitor [1 §2.21] |
| Seasonal peak (A) | "Ski rental, December volume every year" | Pattern if it recurs year on year | Seasonal baseline | Prior-year data. Single-source, vendor [7] |
| High-risk country corridor (B) | "Long-standing supplier in a listed country" | Never a suppression rule | Re-prioritise at most; EDD still applies [9 Art 29, 34(4)] | EDD record, purpose, source of funds |
| PEP routine income (B) | "PEP's ministry salary" | Never a suppression rule | None: enhanced ongoing monitoring is mandatory [9 Art 42(1)(c)]; FCA expects lower thresholds for PEPs [2 3.2.9] | Source of funds |
| Data or feed error (any) | "Duplicate posting from a batch re-run" | Pattern | Fix the data feed [1 §2.13] | Root cause |
| Unverified explanation | "RM confirms it is business-related" | Invalid closure | Reject | MAS Case G and FCA poor practice [1 p.12-13][2 3.2.9] |

Closure note content: what triggered the alert, what was reviewed, why the risk is ruled out, the corroborating source, who decided and when, and whether suspicion was excluded. ČNB calls a bare "OK" a typical deficiency [3 p.15 fn 47]. FFIEC asks for "the specific reason for ... not filing" [10]. MAS: the risk does not end at closure; later activity can reopen a case [1 §2.26].

## 4. Tuning and whitelisting
- ČNB allows whitelisting only as simplified due diligence (§13), per client or account, "nikoliv plošné vyřazování skupin klientů" (not blanket exclusion of client groups), with a methodology, a justification, a regular review that catches new risk factors, and reconstructable afterwards [3 p.14-15]. Inference, not stated by ČNB: simplified due diligence excludes higher-risk clients, so rule B clients cannot be whitelisted.
- Back-test a recalibration and document it; keep senior management informed [1 §2.11]. Measure quality, not only alert counts [1 Case C].
- Oracle supports "trusted pairs" and time-limited entity-scenario suppression [5][6]: the capability exists; it is not a regulatory endorsement.

## 5. False-positive rates
ČNB quotes KPMG: "almost 95%" of alerts are non-suspicious; even a well-tuned rule system is about 10% effective [3 fn 48]. NICE Actimize: "up to 95%" [11]. Both trace to industry estimates; no measured EU figure found. Drivers: stale profiles, no segmentation, thresholds not anchored in data, data errors [1 §2.13][3][8].

## Recommendation (the agent's, not sourced)
Eval reason mix: about 60% pattern, 25% one-off, 15% trap (rule B, PEP, unverified explanation). Score whether the feature declines to turn one-offs and traps into rules. Most likely mistake: the outdated-profile reason, which belongs in a CDD update, not a threshold change.

## Confidence
Confirmed by two or more sources: generic closures need monitoring and RM claims need corroboration [1, 2]; closure must state why suspicion was excluded [3, 10]; recalibration needs back-testing [1, 2]; PEP and high-risk country need EDD [9, 2]; vendor trusted pairs [5, 6]. Single-source: ČNB whitelist conditions [3], seasonal driver [7], the 95% figure [3, 11].

## Sources
1. MAS, Guidance for Effective AML/CFT Transaction Monitoring Controls, 2018-09. https://www.mas.gov.sg/-/media/MAS/Regulations-and-Financial-Stability/Regulatory-and-Supervisory-Framework/Anti_Money-Laundering_Countering-the-Financing-of-Terrorism/Guidance-for-Effective-AML-CFT-Transaction-Monitoring-Controls.pdf
2. FCA, Financial Crime Guide FCG 3.2, 2024-11-29. https://handbook.fca.org.uk/handbook/fcg3/fcg3s2
3. ČNB, Dohledový benchmark 2/2023, 2023-07-03. https://www.cnb.cz/export/sites/cnb/cs/dohled-financni-trh/.galleries/vykon_dohledu/dohledove_benchmarky/download/dohledovy_benchmark_2023_02.pdf
4. DNB, Wwft Q&As and Good Practices 4.1.4, date UNVERIFIED. https://www.dnb.nl/media/z0upf3bv/dnb-wwft-qas-and-good-practices.pdf
5. Oracle, Behavior Detection Glossary (trusted pair), c. 2013. https://docs.oracle.com/cd/E41197_01/books/ECM%206.1_1ed/gl_plat_6.1_1ed.pdf
6. Oracle, Alert Management User Guide 8.0.6 (suppression rules), c. 2018. https://docs.oracle.com/cd/E91253_01/PDF/8.0.6.0.0/Alert%20Management%20User%20Guide_bd_8.0.6.pdf
7. Lucinity, false positives in TM, date UNVERIFIED. https://lucinity.com/blog/understanding-false-positives-in-transaction-monitoring-what-causes-them-and-how-can-ai-can-reduce-operational-waste
8. Azakaw, False positives in AML, date UNVERIFIED. https://www.azakaw.com/blog/false-positives-aml
9. Regulation (EU) 2024/1624 (AMLR), 2024-06-19. https://eur-lex.europa.eu/legal-content/EN/TXT/HTML?uri=CELEX%3A32024R1624
10. FFIEC BSA/AML Manual, Suspicious Activity Reporting. https://bsaaml.ffiec.gov/manual/AssessingComplianceWithBSARegulatoryRequirements/04
11. NICE Actimize, Reducing false positives brochure, 2024-11. https://resources.niceactimize.com/wp-content/uploads/2024/11/aml-reducing-false-positives-in-transaction-monitoring-brochure.pdf
