# High-risk jurisdiction lists and ČNB rates for AML rule B (July 2026 data)

Researched 2026-10-19.

## 1. EU list (Delegated Regulation (EU) 2016/1675 as amended)

Amendments from 2025 to date:

- **(EU) 2025/1184** of 10 June 2025, in force 5 August 2025. It added DZ, AO, CI, KE, LA, LB, MC, NA, NP and VE. It removed Barbados, Gibraltar, Jamaica, Panama, the Philippines, Senegal, Uganda and the UAE [2][1].
- **(EU) 2025/1393** of 8 July 2025 added a review clause. It changed no countries [2].
- **(EU) 2026/46** of 3 December 2025 added a new point IV, "FATF membership suspended", which lists only Russia [2][3].
- **(EU) 2026/83** of 4 December 2025 added Bolivia and the British Virgin Islands. It removed Burkina Faso, Mali, Mozambique, Nigeria, South Africa and Tanzania [4][3].

Both 2026 acts were published on 9 January 2026 and took effect on 29 January 2026 [1][3].

EUR-Lex shows that the current consolidated version is dated 29/01/2026, and that the last act amending 2016/1675 is 2026/83 [15]. The list of 26 countries therefore applied both in July 2026 and today [1][15].

## 2. FATF lists

- **19 June 2026 statements** (the plenary ran 17 to 19 June). This version applied for all of July 2026 [5][6][7].
  - Black list: DPRK, Iran, Myanmar.
  - Grey list: 22 jurisdictions. Bosnia and Herzegovina and Iraq were added; Algeria and Namibia were removed [7][8].
- **Kuwait and Papua New Guinea** were added on 13 February 2026 [16].
- **Second source:** HM Treasury's June 2026 notice gives the same 25 names [10].
- **October 2026:** nothing has been published yet. The FATF page still shows the June lists [5]. The plenary date is UNVERIFIED: one third-party calendar says around 25 October [9].

## 3. Merged list for July 2026 (31 codes)

| ISO | Country                | EU             | FATF                      |
| --- | ---------------------- | -------------- | ------------------------- |
| AF  | Afghanistan            | yes            | no                        |
| DZ  | Algeria                | yes            | no (removed 19 Jun 2026)  |
| AO  | Angola                 | yes            | grey                      |
| BA  | Bosnia and Herzegovina | no             | grey                      |
| BO  | Bolivia                | yes            | grey                      |
| BG  | Bulgaria               | no (EU member) | grey                      |
| CD  | DR Congo               | yes            | grey                      |
| CI  | Côte d'Ivoire          | yes            | grey                      |
| CM  | Cameroon               | yes            | grey                      |
| HT  | Haiti                  | yes            | grey                      |
| IQ  | Iraq                   | no             | grey                      |
| IR  | Iran                   | yes            | black                     |
| KE  | Kenya                  | yes            | grey                      |
| KP  | DPRK                   | yes            | black                     |
| KW  | Kuwait                 | no             | grey                      |
| LA  | Laos                   | yes            | grey                      |
| LB  | Lebanon                | yes            | grey                      |
| MC  | Monaco                 | yes            | grey                      |
| MM  | Myanmar                | yes            | black                     |
| NA  | Namibia                | yes            | no (removed 19 Jun 2026)  |
| NP  | Nepal                  | yes            | grey                      |
| PG  | Papua New Guinea       | no             | grey                      |
| RU  | Russia                 | yes (point IV) | no (membership suspended) |
| SS  | South Sudan            | yes            | grey                      |
| SY  | Syria                  | yes            | grey                      |
| TT  | Trinidad and Tobago    | yes            | no                        |
| VE  | Venezuela              | yes            | grey                      |
| VG  | British Virgin Islands | yes            | grey                      |
| VN  | Vietnam                | yes            | grey                      |
| VU  | Vanuatu                | yes            | no                        |
| YE  | Yemen                  | yes            | grey                      |

- **EU only:** AF, DZ, NA, RU, TT, VU.
- **FATF only:** BA, BG, IQ, KW, PG.

Implementation note: Namibia's ISO code is the string `NA`. Many CSV readers parse it as null, so turn off NA parsing when you load the file.

**Recommendation:** use the union of both lists, including the FATF grey list.

- The challenge's wording reasonably covers the grey list. Most of point I of the EU Annex is itself made up of FATF grey-list countries [4].
- Record which list matched in each decision's explanation.

## 4. ČNB exchange rates

**Daily fixing** [11]:

- URL: `https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt?date=DD.MM.YYYY`. Without a parameter it returns the latest fixing. Use `.xml` instead of `.txt` for XML.
- Line 1 is `DD.MM.YYYY #n`. Line 2 is the header `země|měna|množství|kód|kurz`.
- The field separator is `|` and the decimal mark is a comma.
- Live check for 03.07.2026: `#127`, EUR 24,195, USD 21,130 [12].

**Yearly file** [11][13]:

- URL: `.../rok.txt?rok=YYYY`.
- The file starts with a header `Datum|1 AUD|...|100 JPY|...`, followed by one row per fixing day.
- If the currency set changes during the year, a new header appears mid-file.

**Converting amounts:** CZK = amount × kurz / množství. HUF, INR, ISK, JPY, KRW, PHP, THB and TRY are quoted per 100 units, and IDR per 1000 [13].

**Weekends and holidays:** the fixing is published on working days at about 14:30. It is valid for that day and for any following Saturday, Sunday or public holiday [14]. Use the latest fixing dated on or before the transaction date.

- The 2026 file has no row for the 6 July holiday [13][14].
- So 4, 5 and 6 July all use the 3 July fixing.

**Currencies outside the fixing** (for example IRR): ČNB has a separate API endpoint for them, `/cnbapi/fxrates` [11]. I did not check how often it is published or its format (UNVERIFIED).

## Sources

1. https://finance.ec.europa.eu/financial-crime/anti-money-laundering-and-countering-financing-terrorism-international-level_en (updated 2026-01-09)
2. https://eur-lex.europa.eu/eli/reg_del/2026/46/oj/eng (OJ 2026-01-09)
3. https://fiaumalta.org/news/eu-commission-delegated-acts-on-high-risk-third-countries (2026)
4. https://eur-lex.europa.eu/eli/reg_del/2026/83/oj/eng (OJ 2026-01-09)
5. https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html (checked 2026-10-19)
6. https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/increased-monitoring-june-2026.html (2026-06-19)
7. https://www.fatf-gafi.org/en/publications/Fatfgeneral/outcomes-fatf-plenary-june-2026.html (2026-06-19)
8. https://sumsub.com/media/news/iraq-and-bosnia-on-grey-list-as-algeria-and-namibia-removed (2026-06-23)
9. https://civicadvisoryhub.org/compliance-calendar.pdf (2026-07-15)
10. https://www.gov.uk/government/publications/money-laundering-advisory-notice-high-risk-third-countries--2/money-laundering-advisory-notice-high-risk-third-countries--2 (June 2026)
11. https://www.cnb.cz/cs/casto-kladene-dotazy/Kurzy-devizoveho-trhu-na-www-strankach-CNB (checked 2026-10-19)
12. https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt?date=03.07.2026 (fixing 2026-07-03)
13. https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/rok.txt?rok=2026 (checked 2026-10-19)
14. https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/index.html (checked 2026-10-19)
15. https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32016R1675 (consolidated 2026-01-29)
16. https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/increased-monitoring-february-2026.html (2026-02-13)
