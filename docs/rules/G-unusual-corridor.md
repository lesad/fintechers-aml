# Rule G: unusual foreign corridor

**Status:** proposal, data run 2026-10-19. **Owner:** unassigned. **Alert unit:** one per client.

A novel rule, not in the brief. It fires when a client transacts with one foreign country far more often than the bank-wide rate for that country predicts. Whether that corridor is a normal trading or family link for this kind of client is common sense the code can't encode, and that is Jev's question.

## Source

Our proposal from the data run (geo results, R1). Not a brief rule. It answers the brief's "include any further red flags you identify".

- Typology: transfers to and from jurisdictions with no evident link to the client, and repeated activity concentrated on one destination. FATF CEF "transfers of funds to and from high-risk money laundering jurisdictions" [9]; AMLR Art. 69(2) [1] (origin and destination of funds, the link between several transactions); AMLA draft para 44(a) [2] (linked, repeated or aggregated behaviour). Sources in [aml-pattern-research.md](../challenge/aml-pattern-research.md) sections 1 and 2.
- Mitigator: counterparties in countries with an equivalent AML regime support closure (EBA 9.9(a) [G2], in [aml-legal-sources.md](../challenge/aml-legal-sources.md)). That is why Jev should clear an AT or DE corridor for a Czech company and keep a JP or TR corridor for a private individual.
- Threshold basis: a stated tail probability per client and country, the documented reason ČNB benchmark 2/2023 asks for.

Two uses. [Mentor question 5](../challenge/mentor-questions.md) is decided (team, 2026-10-19): our own `alert_type` values are allowed, preferably scoped by the client's AML risk score, so the choice is ours: its own `alert_type` `UNUSUAL_CORRIDOR`, or a priority factor on A, B and C alerts of the same client (section 6). The current default in [candidates.md](candidates.md) is no new alert type.

## 1. Detect (code)

For each client and each counterparty country other than CZ, SK and the client's own country:

- `k`: the client's July transactions with that country, all directions.
- `n`: the client's July transactions.
- `w`: the country's share of all in and out transactions bank-wide (CZ 71.95 %, SK 12.01 %, DE 3.64 %, AT 1.22 %, JP 0.25 %, BR 0.054 %; full table in the geo results).
- `p = P(X ≥ k)` for `X ~ Binomial(n, w)`.

The client fires when any corridor has `p` below `g_p_max`. The strongest corridor (lowest `p`) goes into the facts; the others are listed.

| Parameter       | Value                                        | Unit                          | Source                                                                                    | Status             |
| --------------- | -------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------ |
| `g_p_max`       | 1e-4                                         | binomial tail, strictly below | data run: about 13 expected under the generator, inside FINREG's 10 to 15 graded per type | default (data run) |
| `g_p_loose`     | 1e-3                                         | binomial tail                 | data run, demo pool                                                                       | default (data run) |
| `g_excluded`    | CZ, SK, the client's own country             | ISO codes                     | CZ and SK are the hub pools; no home bias in the data                                     | default (data run) |
| `g_weights`     | bank-wide in and out share per country, July | 0 to 1                        | data run; recomputed per run                                                              | default (data run) |
| `g_split_remit` | no (data run); yes proposed                  |                               | see the caveat below                                                                      | default (ask team) |

**Remittance caveat.** The data run used the in and out weight `w` for every transaction. A remittance never goes to the client's own country, so its true per-transaction probability is `w / (1 - w_own)`: for a CZ client a far country is 14.4 % of remittances instead of 4.05 % of in and out payments. The ranking therefore tilts toward remittance-heavy corridors (K005121, K001057, K001079 each carry 2 remittances), and "expected `n × w`" understates the expectation on those. The count against the null still holds, because the null used the same formula.

**Proposal:** split `n` into `n_io` (in and out) and `n_remit`, and `k` the same way, and take `p` from the sum of two binomials, `Binomial(n_io, w)` and `Binomial(n_remit, w / (1 - w_own))`. This changes which clients fire, so it needs a rerun before it replaces the data-run cut.

Bonferroni over 33 countries and 5,493 clients (`p` below 2.8e-7) leaves 0 clients. No single hit is statistically surprising; the rule is a budgeted list of the most concentrated corridors.

## 2. Facts (code)

| Fact                         | Meaning                                 | Unit or band                                                                                         |
| ---------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `corridor_country`           | Country of the strongest corridor       | ISO code and name                                                                                    |
| `k`, `n`                     | As above                                | count                                                                                                |
| `expected_k`                 | `n × w` (or the split form)             | count, for `reason` only                                                                             |
| `corridor_p`                 | As above                                | number                                                                                               |
| `concentration_band`         | From `corridor_p`                       | `rarer than 1 in 10,000 under the bank-wide rate` (below 1e-4), `rarer than 1 in 1,000` (below 1e-3) |
| `directions`                 | Directions present in the corridor      | subset of `in`, `out`, `remit`                                                                       |
| `remit_share_band`           | Remittances over `k`                    | `none`, `some`, `most`                                                                               |
| `corridor_volume_share_band` | Corridor CZK over the client's July CZK | `under 10 %`, `10 to 25 %`, above 25 %                                                               |
| `country_group`              | Corridor country                        | `EU or EEA`, `outside EU and EEA`                                                                    |
| `other_corridors`            | Other corridors below `g_p_loose`       | list of ISO codes                                                                                    |

## 3. Gates (code)

| Gate                   | Outcome | Basis                                    |
| ---------------------- | ------- | ---------------------------------------- |
| Client is a PEP        | REVIEW  | No source allows auto-closing PEP alerts |
| AML risk score is high | REVIEW  | AMLA draft para 78                       |
| Tenure under 90 days   | REVIEW  | Same gate as rule A; default (data run)  |

## 4. Judgements (Jev)

Both questions go in one request. Jev sees bands, never the counts.

State (illustrative, bands only):

```json
{
  "client": {
    "type": "natural person",
    "country": "CZ",
    "aml_risk_rating": "medium",
    "pep": false,
    "onboarding": "in person",
    "relationship_band": "under 3 months"
  },
  "corridor": {
    "country": "Germany",
    "country_group": "EU or EEA",
    "directions": ["in", "out", "remit"],
    "remittance_share": "some",
    "concentration_band": "rarer than 1 in 10,000 under the bank-wide rate for this country",
    "share_of_client_volume": "10 to 25%",
    "currency": "EUR"
  },
  "other_foreign_countries": ["Austria", "Poland"]
}
```

Questions:

```json
{
  "corridor_plausible": {
    "type": "noul",
    "instructions": {
      "question": "A Czech bank's AML analyst reviews a client who transacts with one foreign country far more often than other clients do. Given `client` and `corridor`, is a regular payment corridor with `corridor.country` plausible for this client?",
      "guidance": [
        "A neighbouring state, a major trading partner or a common diaspora country is a normal partner.",
        "The direction should fit the client type: a company receiving from a customer market, a person sending to family abroad.",
        "Remittances (no account on the payer side) dominating a corridor to a country outside Europe call for doubt.",
        "Treat new, remotely onboarded or high-risk clients with more doubt."
      ]
    },
    "criteria": {
      "true": "The corridor is a normal trading, work or family link for this type of client and home country",
      "false": "A regular flow with this country has no evident link to this client, so the purpose of the corridor needs checking"
    }
  },
  "likely_link": {
    "type": "choice",
    "instructions": "Given `client` and `corridor`, which explanation best fits a regular payment corridor between this client and `corridor.country`?",
    "criteria": {
      "trade_partner": "Suppliers or customers in that country, fitting the client type",
      "employment_or_study": "Work for an employer or clients there, or study costs",
      "family_or_personal": "Family support, property or personal ties to that country",
      "other": "No ordinary explanation fits this client"
    }
  }
}
```

The option order of `likely_link` is fixed as written and logged.

## 5. Triage policy (code)

| Condition                                                           | Triage |
| ------------------------------------------------------------------- | ------ |
| Any gate                                                            | REVIEW |
| `corridor_plausible` ≥ `g_close_p` and `likely_link` is not `other` | FP     |
| Anything else                                                       | REVIEW |

| Parameter          | Value      | Status                                       |
| ------------------ | ---------- | -------------------------------------------- |
| `g_close_p`        | 0.85       | default, tune on labels (geo proposal 0.7)   |
| `g_uncertain_band` | 0.4 to 0.6 | default; flagged "Jev uncertain" in `reason` |

## 6. Priority

Input to [priority.md](priority.md), default (data run): +10 on any A, B or C alert of the client when it has a corridor below `g_p_loose` and `corridor_plausible` is below 0.5.

## 7. Route

Proposed row "F, G" in [escalation.md](escalation.md), which follows "A, REVIEW" and "A, FP".

## Reason template

> Rule G: client ({type}, {country}) made {k} of {n} July payments with {corridor_country} ({directions}); at the bank-wide rate for that country we would expect about {expected_k}. This corridor is {concentration_band} (threshold p below 1e-4). Jev ({model}): corridor plausible p = {corridor_plausible}, likely link {likely_link}. {decision_sentence}

## Test cases

Client with `n` = 72 July transactions, data-run weights.

| Case              | Input                                                    | Expected                                    |
| ----------------- | -------------------------------------------------------- | ------------------------------------------- |
| AT below the cut  | 6 transactions with AT (`w` 0.0122)                      | Does not fire (p 2.6e-4); in the loose pool |
| AT at the cut     | 7 transactions with AT                                   | Fires (p 3.0e-5)                            |
| DE below the cut  | 10 transactions with DE (`w` 0.0364)                     | Does not fire (p 2.8e-4)                    |
| DE fires          | 11 transactions with DE                                  | Fires (p 5.8e-5)                            |
| Rare country      | 3 transactions with BR (`w` 0.00054)                     | Fires (p 9.1e-6)                            |
| Rare country, two | 2 transactions with BR                                   | Does not fire (p 7.3e-4); in the loose pool |
| Own country       | DE client, 11 transactions with DE                       | Does not fire (own country excluded)        |
| Hub country       | 20 transactions with SK                                  | Does not fire (SK excluded)                 |
| K005121 (data)    | `n` 75, 9 with AT                                        | Fires (p 3.6e-7)                            |
| Plausible close   | LE, CZ, AT corridor, risk low, p = 0.92, `trade_partner` | FP                                          |

## Open questions

For the team: the remittance split above, and one far-country list shared with [rule F](F-tail-payment-context.md).

## Change log

What to expect under the generator: the counterparty country is drawn per transaction from one fixed weight vector, the same for every client, with no home bias. So the count of hits at a cut is what chance gives. Every count below is a chance rate on synthetic data. The value is the stated tail probability and the question, not a planted case.

| Date       | Change                   | Alerts                               | FP share | Agreement (n) |
| ---------- | ------------------------ | ------------------------------------ | -------- | ------------- |
| 2026-10-19 | Data run, `p` below 1e-4 | 13 clients; null 13.8 (11 to 18)     | n/a      | n/a           |
| 2026-10-19 | Data run, `p` below 1e-3 | 101 clients; null 110.8 (105 to 116) | n/a      | n/a           |

Null: country, currency and rate shuffled across transactions within direction (and within direction and client country for remittances), 5 seeds, mean (min to max). Overlap at 1e-4: high risk 0, PEP 0, tenure under 90 days 1, distant 1, natural persons 5. At 1e-3: high 5, PEP 1, tenure under 90 days 4, distant 25, natural persons 42. Hits at 1e-3 spread over 30 countries (DE 10, FR 8, HU 7, AU 6, TR 6), as the null predicts.

Top cases: K005121 (LE, AT, 9 of 75, p 3.6e-7), K002464 (LE, JP, 5 of 73, 1.3e-6), K001057 (NP, PT, 4 of 84, 3.7e-6), K000802 (LE, distant, TR, 4 of 78, 2.3e-5), K005392 (NP, 43 days, DE, 11 of 66, 2.5e-5), K001229 (LE, DE, 10 of 59, 5.0e-5), K001674 (NP, GB, 5 of 65, 5.1e-5), K001079 (LE, CA, 3 of 64, 5.4e-5), K004317 (NP, CH, 4 of 70, 5.7e-5), K002987 (LE, BE, 5 of 83, 5.8e-5). Transaction ids are in the geo results.
