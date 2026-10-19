# AML triage: UX patterns, typed AI on Bedrock, demo plan (2026-10-19)

All pages read on 2026-10-19. "Vendor claim" means the figure comes from the vendor's own page. Recommendations are ours.

## 1. How vendors present triage and investigation

- **Single case view with all context.** Lucinity's Case Manager puts alerts, customer data, behaviour and external signals in one view "with no need for multiple system switches", plus money-flow visualisation [1][2]. SymphonyAI Sensa uses a "subject-centric view" with a credit/debit chart, a transaction list and a copilot chat beside it [3][4]. Napier's Client Activity Review compares observed behaviour against KYC-expected behaviour [5]. That is exactly our "profile discrepancy" rule.
- **Agent pre-investigates, human disposes.** Unit21 agents pull history, check watchlists, draft a narrative and recommend "escalate or close as false positive"; an analyst reviews every action [6][7]. Flagright's AI Forensics starts when a case opens and keeps the final call human; its case view has SLA timers, role-based routing and an exportable audit trail [8][9].
- **Plain-language "why".** Napier shows a recommendation that identifies likely false positives and explains why the alert was raised, with links to the policies used [10][11].
- **4-eyes.** Oracle Investigation Hub's Supervisor can Block, Release or Reject (send back to the analyst), and Oracle calls this "the four-eyes approval process". The analyst flow goes Account, then Graph with a transactions tab, then Review [12].
- **Network graph.** Quantexa's differentiator is entity resolution plus graph and link analysis (analyst reports from Celent and Chartis) [13].
- **Complaints.** Fragmented systems, alert backlogs and analyst burnout (Unit21) [14]. Investigators switch "between spreadsheets, emails, and dashboards" (Facctum) [15]. Both are vendor blogs.
- Vendor claims: Lucinity up to 90% faster [1]; Sensa 70% faster [3]; Hawk 70% fewer false alerts, and 98% of known false positives cleared at Alviere [16]. ComplyAdvantage and Feedzai: only marketing-level statements found ("prioritise alerts", "up to 70%" per a third-party review). UNVERIFIED.

## 2. Typed AI on Bedrock

Status (2026-10-19, later the same day): superseded for decisions. Jev answers the typed questions and Claude Sonnet 4.5 only writes text ([decision-architecture.md](decision-architecture.md)). The schema limits and the range-check rule below still apply to any Bedrock structured output, and a forced tool call on gpt-oss-120b or Sonnet 4.5 is the fallback decider if Jev access fails.

- Two mechanisms: a JSON-schema output (`outputConfig.textFormat` in Converse) and `strict: true` on tool definitions. Schemas reject `minimum`/`maximum`, `minLength`/`maxLength` and recursion; `additionalProperties` must be `false`. Structured outputs cannot be combined with Anthropic citations [17][18]. So a 0 to 1 score and the cited transaction ids can be typed, but our code must range-check the score and verify each id exists.
- **gpt-oss-120b** supports Frankfurt In-Region, Converse and structured outputs on `bedrock-runtime`. Client-side tool calling is listed only for `bedrock-mantle` [19]. This is the non-Claude model that fits. Its card says "EOL no sooner than 2026-08-05", yet the model is still Active; check it on day 1.
- **Nova 2 Lite** (`eu.amazon.nova-2-lite-v1:0`) supports client-side tool calling but not structured outputs [20].
- Fallback: **Claude Haiku 4.5** through `eu.*` supports both structured outputs and tool calling [21]. Unlike Haiku 5.5, which has neither (see [bedrock-fit.md](https://gitlab.com/morosystems/other/fintechers-hackathon-2026/-/blob/main/context/4-archive/i02-i06-payee-check/bedrock-fit.md)). Its `eu.` profile failed with ServiceUnavailableException on 2026-10-19 ([aws-account-setup.md](aws-account-setup.md)), so it is no fallback for us.
- Reference pattern: OpenAI's cookbook on Bedrock (2026-07-23). The model proposes an assessment, application code checks the structured claims against deterministic calculations, and a human decides [22]. AWS's Quick and Snowflake triage post uses an eight-section brief with a risk score and a recommended disposition [23]. DEV326 (re:Invent 2025) has eight Strands agents with an audit agent [24].
- UNVERIFIED: how to calibrate LLM confidence. No primary source found. Calibrate the tabular score, not the LLM.

## 3. False-positive evidence

- 90 to 95% is the common figure. It is attributed to PwC (via DataVisor) [25] and McKinsey (via Sanction Scanner, which also cites Everest Group 2025 at 85 to 90%) [26]. No primary report was read: secondary only.
- Independent study: an ML triage model run after the rules cut false positives by 80% while keeping over 90% of true positives on real bank data (arXiv, 2021) [27].
- HSBC with Google AML AI: 2 to 4 times more suspicious activity and over 60% fewer alerts (Google press release, 2023; vendor claim) [28].

## 4. Graph and timeline in the browser

- Sigma.js renders with WebGL on top of graphology and has React bindings (`@react-sigma`). Cytoscape.js and vis-network draw on Canvas. Cytoscape has the most layouts and graph algorithms [29]. In Memgraph's benchmark vis-network was an order of magnitude slower, and Sigma was the fastest on large graphs [30].
- React Flow suits node UIs. Its own guide warns about re-renders when there are many nodes [31].
- A few hundred nodes is well within the range of Cytoscape and Sigma (inferred from [29][30], not benchmarked).
- Timeline view: no library source checked. See the recommendation.

## Recommendation (ours)

- **Screens.**
  1. Queue: score band, rule chips (A profile, B country/PEP, C flow-through), SLA and an "AI suggests FP" badge.
  2. Case: evidence panel, flow graph and timeline.
  3. Approver inbox.
  4. Audit export.
- **Libraries.** Cytoscape.js (`react-cytoscapejs`, dagre left-to-right layout) for the money-flow graph: in-accounts, the subject, then out-accounts. Edges are sized by amount. For the 24h-in / 6h-out pattern, use a hand-rolled SVG swimlane: inflows above the axis, outflows below, and a shaded 6 h window. That is a few hours' work and needs no extra dependency.
- **Wow interaction.** Hovering an evidence chip in the AI rationale (for example "92% of inflow left within 5 h") lights up the same transaction ids in the graph, the timeline and the rule trace together. One gesture shows the typed decision, its evidence and the deterministic rule. Closing beat: the analyst clicks Escalate, the case moves to the approver (4-eyes state goes from "1/2 signed" to "2/2 signed"), and the signed JSON audit record downloads.
- **Explainable and auditable, visibly.**
  - A rule-trace card showing threshold, actual value and pass/fail.
  - The score with its top feature contributions.
  - The model id and prompt hash on every AI output.
  - An append-only event log.
- **30-hour split.** Two FE developers build the queue and case screens. One builds graph and timeline. Martin builds the rules in Kotlin, the scorer, the Jev calls and the Sonnet 4.5 summary call. Use recorded fixtures for the demo.

## Sources

1. https://lucinity.com/blog/unlocking-compliance-productivity-how-ai-case-management-cuts-investigation-times-without-cutting-corners (undated)
2. https://lucinity.com/case-management (undated)
3. https://www.symphonyai.com/news/financial-services/best-financial-crime-investigation-datos-insights (2024-08-20)
4. https://www.symphonyai.com/financial-services/netreveal-sanctions-screening/false-positives (undated)
5. https://www.napier.ai/client-activity-review (undated)
6. https://www.unit21.ai/products/ai-agent (undated)
7. https://www.unit21.ai/blog/account-takeover-fraud-detection (undated)
8. https://www.flagright.com/case-management (undated)
9. https://www.flagright.com/post/best-aml-case-management-software (undated)
10. https://www.napier.ai/client-screening (undated)
11. https://learn.napier.ai/hubfs/eBooks/Reduce_False_Positives_Screening.pdf (undated)
12. https://docs.oracle.com/en/industries/financial-services/financial-crime-compliance/investigation-hub-cloud/ihueg/using-investigation-hub.pdf (undated)
13. https://finance.yahoo.com/news/quantexa-named-category-leader-chartis-080000121.html (2025)
14. https://www.unit21.ai/blog/why-case-management-challenges-hold-risk-compliance-teams-back (undated)
15. https://www.facctum.com/terms/aml-investigation (undated)
16. https://hawk.ai (undated)
17. https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html (current)
18. https://aws.amazon.com/blogs/machine-learning/structured-outputs-on-amazon-bedrock-schema-compliant-ai-responses (undated)
19. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-oss-120b.html (current)
20. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html (current)
21. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html (current)
22. https://developers.openai.com/cookbook/examples/partners/aws/evidence_grounded_aml_agent_with_bedrock (2026-07-23)
23. https://aws.amazon.com/blogs/machine-learning/automate-aml-alert-triage-with-amazon-quick-and-snowflake-cortex-ai (undated)
24. https://dev.to/aws/dev-track-spotlight-anti-money-laundering-multi-agent-orchestration-with-aws-strands-dev326-6p8 (2025-12)
25. https://www.datavisor.com/blog/guest-post-end-the-false-positive-alerts-plague-in-anti-money-laundering-aml-systems (undated)
26. https://www.sanctionscanner.com/blog/ai-powered-transaction-monitoring-how-to-reduce-false-positives-by-7080-1334 (2026)
27. https://arxiv.org/html/2112.07508v3 (2021)
28. https://www.googlecloudpresscorner.com/2023-06-21-Google-Cloud-Launches-AI-Powered-Anti-Money-Laundering-Product-for-Financial-Institutions (2023-06-21)
29. https://www.pkgpulse.com/guides/cytoscape-vs-vis-network-vs-sigma-graph-visualization-2026 (2026)
30. https://memgraph.com/blog/you-want-a-fast-easy-to-use-and-popular-graph-visualization-tool (undated)
31. https://reactflow.dev/learn/advanced-use/performance (current)
