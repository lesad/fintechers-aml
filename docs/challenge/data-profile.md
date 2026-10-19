# ČNB dataset profile

Profiled on 2026-10-19 from the shared bucket's `CNB/` folder, copied into the app repo under `data/raw/` (git-ignored). Counts are from a one-off script over the raw files.

## Shape

- `clients.csv`: 5,493 clients, 12 columns: `client ID; country of client; date of contract; contract concluded; PEP; type of client; expected volume of transactions at the time of contract conclusion [CZK]; expected number of transactions at the time of contract conclusion; real volume of transactions in 2Q2026 [CZK]; real number of transactions in 2Q2026; maximal volume of transaction in 2Q2026 [CZK]; AML risk score`.
- `transactions.csv`: 397,853 transactions, 11 columns: `transaction ID; client ID; date; time; volume; currency; country of payer; country of payee; account of payer; account of payee; type of transaction`.
- Semicolon-separated, UTF-8 with BOM, dates `DD.MM.YYYY`, decimal point.
- All transactions fall in July 2026 (1 to 31 July), matching the ruleset's "July 2026 vs Q2 2026".

## Values

- Transaction types: outgoing payment 187,152; incoming payment 170,986; remittance 39,715. Remittances always have an empty payer account, so direction is unclear. Rule B's PEP branch says "where direction is unclear, any transaction", which covers remittances.
- 23 currencies: CZK 266,240, EUR 96,570, then USD, PLN, CNY, HUF, RON, GBP, SEK, DKK, CHF, JPY, TRY, NOK, KRW, INR, CAD, BRL, AUD, MXN, SGD, ZAR, ISK. All need CZK conversion with the ČNB fixing.
- 33 countries appear as payer or payee: AT, AU, BE, BR, CA, CH, CN, CZ, DE, DK, ES, FI, FR, GB, HU, IE, IN, IS, IT, JP, KR, MX, NL, NO, PL, PT, RO, SE, SG, SK, TR, US, ZA. No empty or `NA` values.
- Clients: PEP 23 of 5,493. Type: natural person 2,594, legal entity 2,551, "enterpreneur" 348 (spelled that way in the data). Contract in person 3,993, distant 1,500. AML risk score low 3,686, medium 1,415, high 392. One client had no transactions in Q2 2026. Contracts from 2020 to 2026.
- PEP clients' transactions: 773 outgoing, 724 incoming, 163 remittances.

## FX rates

`scripts/pull-data.sh` in the app repo downloads the ČNB yearly file (`rok.txt?rok=2026`) to `data/raw/cnb-fx/rok-2026.txt`. It covers all 23 currencies in the data. Rows are `DD.MM.YYYY|rate|rate|...` with a decimal comma; the header gives the quantity per currency (`100 HUF`, `100 INR`, `100 ISK`, `100 JPY`, `100 KRW`, `100 TRY`), so divide the rate by it. Use the last fixing on or before the transaction date.

## Findings that affect the build

1. **No country in the data is on the July 2026 EU or FATF high-risk lists** ([rule-b-reference-data.md](rule-b-reference-data.md)). Rule B's country branch fires zero times with the current lists; only the PEP branch fires. The data may have been built against an older list: ZA and TR were on the FATF grey list in earlier years (from memory, UNVERIFIED). Ask FINREG which list they mean.
2. **No MCC column.** The track page mentions MCC codes, but `clients.csv` has none. Profile-consistency questions must use client type, contract channel, country and expected volume instead.
3. **"Expected volume ... at the time of contract conclusion" has no period.** Rule A treats it as the "projected monthly volume". Confirm at the briefing.
4. **Q2 average daily volume needs a day count:** 91 calendar days or business days. Confirm at the briefing.
5. **Rule C needs the counterparty account:** "not the payer's account" compares the outgoing payee account with the incoming payer accounts. Remittances have no payer account.

## Rule dry run (2026-10-19, second pass)

A DuckDB pass over the raw files (script in the session scratchpad, not in a repo). Rule C here is an approximation: rolling 24 h inflow windows per incoming payment, outflow in the 6 h after the window's last inflow, to payees that weren't among the window's payers. Q2 average daily volume uses 91 days.

### FX conversion decides the alert volume

The median amount is about 3,000 in every currency (CZK 2,992, EUR 2,970, USD 2,987, HUF 3,020). The generator drew amounts without regard to currency, and the Q2 statistics behave like unconverted amounts (Q2 average transaction 2,999). Converting to CZK, as the brief requires, multiplies EUR amounts by about 24.

|                                                  | Converted to CZK (as the brief says) | Not converted |
| ------------------------------------------------ | ------------------------------------ | ------------- |
| July volume vs Q2 monthly volume (median client) | 13.95x                               | 1.94x         |
| Rule A clients                                   | 5,493 of 5,493                       | 4,669         |
| Rule B PEP transactions (clients)                | 112 (22)                             | 4 (3)         |
| Rule C clients (approximation)                   | 1,077                                | 16            |

Rule A is noisy either way: even unconverted, 85% of clients trip it. That is the triage problem the challenge describes, but FINREG should confirm the conversion before we tune anything. Ask at the 17:00 office hours.

### Other facts

- Expected volume at contract is monthly: Q2 real volume over expected volume has a median of 3.36 (p10 2.86, p90 3.87), and the transaction counts give the same 3.36.
- Account roles: outgoing payments have the client id as payer account; incoming payments have it as payee account; remittances have no payer account.
- Counterparty accounts look like `A` + country + 5 digits (`ACZ00172`), so the account encodes its country. 5,380 counterparty accounts; the median is shared by 9 clients and one by 1,372. No transaction goes between two clients.
- Round amounts: none of the amounts of 10,000 or more is a whole thousand, so a round-sum flag finds nothing. Amounts just under 10,000 don't show a structuring bump (8,792 in 9,000 to 9,999 vs 7,495 in 10,000 to 10,999, unconverted, in line with a falling distribution).
- 6.8% of transactions fall between 00:00 and 06:00.
- 239 clients signed their contract on or after 1 April 2026, so their Q2 figures cover part of the quarter and a 91-day average understates their normal volume. One client had no Q2 transactions.
- Rule C windows often cross midnight: 16,217 qualifying windows (converted) span two dates.

### Rule A after conversion (third pass)

Conversion stays: it is the customer's rule. Per client, taking the worst July day:

| Branch (threshold)                     | p10  | median | p90   |
| -------------------------------------- | ---- | ------ | ----- |
| Daily volume / expected monthly (0.25) | 0.92 | 3.27   | 11.72 |
| Daily volume / Q2 average daily (3)    | 25   | 91     | 339   |
| Single transaction / Q2 maximum (2)    | 9.8  | 18     | 38    |

- Clients breach on 17 of 31 days (median; p10 10, p90 24).
- Foreign currency makes up 91% of the median client's July volume in CZK terms. No client pays only in CZK.
- On CZK payments alone, rule A still fires for 4,242 clients. Two reasons, both unconverted: July days carry 1.9x the Q2 average day, and a client's busiest day is 4x their average July day. The "3x the Q2 daily average" branch fires through ordinary variance.
- Clients contracted in Q2 have a CZK-only ratio twice the rest (median 13.1 vs 6.1), because their Q2 figures cover part of the quarter.

Rule A as written is a full-recall list, not a filter: one alert per client, 5,493 alerts. It becomes usable as a ranking on facts that don't depend on the currency mix. Sizes on this data:

| Fact                                                                                                  | Clients                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------- |
| A single CZK payment above 2x the Q2 maximum                                                          | 702                                   |
| A CZK-only day above 10x the Q2 average day, with the Q2 baseline scaled for clients contracted in Q2 | 1,695                                 |
| Either of the two                                                                                     | 2,003                                 |
| Either, and high AML risk or PEP                                                                      | 167 (of 406 high-risk or PEP clients) |

These cut-offs are illustrations, not a tuned model.
