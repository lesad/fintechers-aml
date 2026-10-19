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
