# Further red flags: candidates

Rule C says "include any further red flags you identify". This is the backlog: each candidate with its formula, its basis, what our data says, and what we propose to do with it.

Until FINREG answers mentor question 5, the default is no new `alert_type`: a further flag raises priority (the "conduct discrepancies" and "multiple flags" factors in [priority.md](priority.md)) and is named in `reason`.

## What the guidance asks for

From the team's pattern research (a parallel session on 2026-10-19; the primary sources are linked, but this session has not re-read them):

- There is no EU red-flag list yet. AMLA has until 10 July 2027 to publish one (AMLR Art. 69(5)). Until then the usable lists for this data are FAÚ methodological guidance no. 9 on transit accounts (16 September 2024) and the FATF, Interpol and Egmont report on cyber-enabled fraud, Annex A (November 2023).
- Monitoring compares payments with the declared profile (AMLR Art. 26(1), 69(2)) and covers patterns across linked transactions, not only single payments (AMLA draft guidelines on ongoing monitoring, para 44).
- Peer groups may set thresholds, but a normal-looking peer group is no reason to dismiss one client's red flag (AMLA draft paras 54 and 55).
- Every segment threshold needs an internal analysis that justifies it (ČNB benchmark 2/2023). So every threshold below carries the data run that chose it.

## Candidates

"Peer group" means clients of the same type, contract channel and AML risk score. Percentile cut-offs are placeholders until a data run sets them.

| #   | Candidate                     | Formula (code)                                                                                                                | Basis                                          | Data verdict                                                                     | Proposal                                                                  |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Profile gap against peers     | July volume over expected, July count over expected, July volume over Q2 monthly; each above the peer group's 99th percentile | AMLR 26(1), 69(2)                              | Not run. Needs the CZK-only variant (see rule A)                                 | Priority factor for rule A; Jev reads it in `state`                       |
| 2   | New client, high volume       | Contract under 90 days old and July volume in the peer group's top 5%                                                         | FATF, FAÚ; EBA 9.6(a)(v)                       | 239 clients contracted in Q2; volume cut not run                                 | Priority factor                                                           |
| 3   | Quiet, then a burst           | Q2 count near 0 (or Q2 volume in the bottom 10%) and July volume in the top 5%                                                | EBA 9.6(b)(iv); AMLA draft                     | One client with no Q2 transactions; percentile cut not run                       | Rule A gate (already) plus priority factor                                |
| 4   | Gather, then scatter          | At least k distinct payers within 24 h, then at least k distinct payees within 48 h, hub accounts excluded                    | AMLA draft para 44                             | Not run. One counterparty account is shared by 1,372 clients: exclude hubs first | Rule C fact (`flow_shape`); separate flag if it finds cases rule C misses |
| 5   | Shared counterparty cluster   | A counterparty used by 5 to 50 clients who are mostly new or onboarded remotely                                               | AMLA draft para 44(c)                          | Not run. Median counterparty is shared by 9 clients                              | Code finds clusters; Jev asks "plausible common payee?"                   |
| 6   | Foreign in, foreign out       | Domestic client, foreign inflow, at least 80% sent abroad within 48 h                                                         | FAÚ guidance no. 9 (transit accounts)          | Not run                                                                          | Rule C fact (`cross_border_out`) or separate flag                         |
| 7   | High-risk share of volume     | Share of volume to or from list countries (country field or the country in the account id)                                    | Rule B, FATF                                   | Zero on the July 2026 lists                                                      | Priority factor; live only if the list changes                            |
| 8   | Largest payment against peers | Largest single payment over the peer group's distribution                                                                     | AMLA draft paras 54 and 55; ČNB segment limits | Not run                                                                          | Priority factor for rule A                                                |
| 9   | Just under a threshold        | Amounts in CZK 90,000 to 100,000 against the overall histogram (rule C's threshold)                                           | AMLA draft para 44(d); FFIEC                   | Under 10,000 (unconverted): no bump. The 90,000 to 100,000 band: not run         | Run it; flag only if a bump shows                                         |
| 10  | Round amounts                 | Amounts of 10,000 or more that are whole thousands                                                                            | Common typology                                | **None in the data.** Drop                                                       | Drop                                                                      |
| 11  | Missing payer information     | Remittance with no payer account                                                                                              | TFR Art. 7 and 9                               | All 39,715 remittances. As an alert it is pure noise                             | Priority factor only                                                      |
| 12  | Night activity                | Share of a client's transactions between 00:00 and 06:00                                                                      | Typology unconfirmed                           | 6.8% of all transactions                                                         | Low weight, or drop                                                       |
| 13  | Many currencies               | Distinct currencies per client above the peer group's 99th percentile                                                         | Typology unconfirmed                           | 23 currencies; no client pays in CZK only                                        | Low weight, or drop                                                       |

## Planted patterns to look for

The data is synthetic, and generators leave traces. Worth one query each:

- amounts just above CZK 100,000
- forwarded shares sitting at exactly 0.80
- gaps just under 6 h or 24 h
- groups of clients with the same contract date and profile

A hit is a sign the organisers built that typology in, and a strong candidate for a flag.

## Sources

- AMLR, Regulation (EU) 2024/1624: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1624
- AMLA draft guidelines on ongoing monitoring, 3 June 2026: https://www.amla.europa.eu/document/download/46b50078-08ed-4ab1-aea0-28b1a6085755_en
- FAÚ methodological guidance no. 9, 16 September 2024: https://fau.gov.cz/assets/cs/cmsmedia/Metodick%C3%A9%20pokyny/mp-c-9-16-09-2024-cista-verze.pdf
- FATF, Interpol and Egmont, Illicit financial flows from cyber-enabled fraud, 9 November 2023: https://www.fatf-gafi.org/en/publications/Methodsandtrends/illicit-financial-flows-cyber-enabled-fraud.html
- ČNB benchmark 2/2023: https://www.cnb.cz/export/sites/cnb/cs/dohled-financni-trh/.galleries/vykon_dohledu/dohledove_benchmarky/download/dohledovy_benchmark_2023_02.pdf
- Data verdicts: [data-profile.md](../challenge/data-profile.md)
