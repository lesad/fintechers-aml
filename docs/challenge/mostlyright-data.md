# MostlyRight data: what it holds and what matching would need

Profiled on 2026-10-19 from `data/raw/MostlyRIght/MostlyRight_EU_financial_firm_licences_and_warnings_2026-10-18.csv` (the copy in the organisers' bucket) and the dataset page https://mostlyright.md/datasets/eu-financial-firm-licences-and-regulator-warnings.

## Summary

- Good reference data for counterparty screening: licence, warning, sanction, SEPA Instant and Verification of Payee (VoP) status.
- It cannot be joined to the ČNB transactions: they carry only synthetic account codes, with no names, BIC, IBAN or domains. 0 identifiers match.
- Recommendation: a separate screening screen or agent tool in the demo, not an input to alert triage.

## The file in the bucket

One CSV, comma-delimited, 34 columns, version 2026-10-18. The bucket has no README or schema next to it.

| record_type      | Records | Sources                                                                                                | Identifiers                                      |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `warning`        | 3,587   | AMF blacklists (3,409: forex, binary options, crypto, impersonation), ESMA non-compliant CASPs (178)   | name, `website_domain`, `email_domain`           |
| `payment_scheme` | 2,944   | EPC registers: SEPA Instant and VoP participants                                                       | `bic`, name, country                             |
| `licence`        | 2,142   | ČNB (banks, exchange offices, credit intermediaries, non-bank lenders), ESMA MiCA (CASPs, EMT issuers) | name, `national_id` (IČO), `lei`, address        |
| `sanction`       | 1,692   | EU financial sanctions, entities only                                                                  | name and aliases, country, `eu_reference_number` |

Counts are over the 10,365 well-formed records (see the quality problems below).

## Quality problems

- **Mixed encoding.** 4,448 lines are UTF-8 and 6,096 are not; cp1250 decodes most of them. A plain UTF-8 read fails.
- **"č" stored as a bare CR byte** (`Hlav\xe1\rek` for "Hlaváček"), 830 times. A CSV reader treats it as a line break and shifts the columns.
- After a heuristic repair (UTF-8 per line with a cp1250 fallback, CR → "č"), 10,365 of 10,456 records have 34 fields; about 90 stay malformed. Other mis-encoded characters were not checked.
- A loader must handle this. Worth reporting to the organisers. ČNB benchmark 2/2023 (p. 12) names exactly this risk: encodings and transliteration must not lose or mix up client names and addresses.

## The published dataset (page, 2026-10-19)

- Larger and newer: 51,010 records (21,342 licences, 24,946 warnings, 2,947 payment scheme participants, 1,775 sanctions), rebuilt daily. It adds national registers (NBS, MNB, KNF, FI and others). Our bucket copy is a subset.
- Stated use: check a counterparty's licence and authority, screen a firm or website against warnings and sanctions before payment, and test that an AI agent checks before moving money.
- Stated limits: absence from the table proves nothing (licensed, unlicensed or safe). A clone warning names the impersonated firm but refers to the impersonator. The EBA payment and e-money register is not included. A licence with an `until` date has ended.
- The page describes about 15 of the columns; `value_kind` (website, email, firm) is not described. No encoding or format notes.
- Download: the Data tab may need a login; not tried.
- Not unique content: every source is public (EU Financial Sanctions Files, ČNB JERRS, ESMA and EPC registers, AMF). What it adds is one schema with shared identifier columns, daily rebuilds and a shape meant for agents.

## Why it does not join to the ČNB transactions

| ČNB transaction field        | Content                                                                                                                                       | Usable MostlyRight key           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `account of payer` / `payee` | Synthetic codes (`K003797`, `ACZ00172`, `AAT00116`); the two letters after `A` follow the currency, not the country (`ACZ` count = CZK count) | none                             |
| `country of payer` / `payee` | 33 ordinary countries, none sanctioned or high-risk                                                                                           | country only, and it never fires |
| name, BIC, IBAN, LEI, domain | not present                                                                                                                                   | -                                |

## What matching would need

From each transaction, at least one of:

1. **Counterparty BIC** (the bank on the other side): an exact join to `bic`, giving SEPA Instant or VoP participant, licensed bank, or unknown institution. Real payments carry it or let it be derived: SWIFT messages always name the BIC, a SEPA IBAN embeds the bank code, and a Czech account number has a four-digit bank code that ČNB's code list maps to a BIC.
2. **Counterparty name**, ideally with country: a fuzzy match against `name` and `other_names`, giving a sanction or warning hit. Needs normalisation (legal-form suffixes, diacritics, transliteration) and a score threshold with human review of hits, because names collide. Real SEPA and SWIFT payments carry both parties' names; EU Regulation 2023/1113 (TFR) requires payer and payee information on transfers.
3. **Counterparty LEI or national id (IČO)**: an exact join to `lei` or `national_id`, giving the licence.
4. **Website or e-mail domain** (card or e-commerce payments, or the payment reference): an exact join to `website_domain` or `email_domain`, giving an AMF or ESMA warning.

Plus the full 51k dataset (or the source registers) and the encoding repair.

Not recommended: inventing names or BICs for the synthetic accounts to force hits. It would read as fabricated data in the demo.

The statements on real payment messages are general knowledge, not checked against the scheme rulebooks.

## Is the ČNB data based on real transactions?

The organisers call it synthetic, with no real names or accounts ([data-profile.md](data-profile.md)). The data shows generator patterns rather than anonymised real payments (our reading, not confirmed):

- Amounts have the same distribution in every currency (median about 3,000 in CZK, EUR, JPY and KRW alike).
- Account prefixes follow the currency.
- Every client has 43 to 107 July transactions; nobody is idle, nobody is extreme.
- Q2 real volume is 0 to 3.99 times the expected volume, a hard cap just under 4.
- Two flat hour bands: 08:00 to 17:00 is about 8 times busier than the night.

Whether the generator was calibrated on real ČNB statistics is not stated.
