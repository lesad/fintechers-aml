# Rule F: tail payment with a country fact

**Status:** proposal, data run 2026-10-19. **Owner:** unassigned. **Alert unit:** one per transaction.

A novel rule, not in the brief. It fires on a payment that is rare for the client's own payment size and also carries a country fact: an inflow from a distant country, or the client's only transaction with a foreign country this month. The size is arithmetic and stays in code. Whether that size with that country fits this kind of client is common sense, and that is Jev's question.

## Source

Our proposal from the data run (tails results, T2, with T1 folded in). Not a brief rule. It answers the brief's "include any further red flags you identify".

- Typology: an unusually large single transaction, and transfers to or from a jurisdiction with no evident link to the client. AMLR Art. 34(2) and AMLD Art. 18(2) (examine unusually large transactions); EBA 9.4(f) [G2] (unusually high value); ČNB RS2019-03 (an unusually large transaction, or one without an apparent economic purpose, is a higher-risk factor); AMLR Art. 69(2) (origin and destination of funds); SAML-D "single large transaction" typology [16]. Sources in [aml-pattern-research.md](../challenge/aml-pattern-research.md) sections 1, 2 and 5, and [aml-legal-sources.md](../challenge/aml-legal-sources.md).
- Threshold basis: a client-relative cut with a stated tail probability ("a 1-in-741 payment for this client"), which is the documented reason ČNB benchmark 2/2023 asks for.

Two uses. [Mentor question 5](../challenge/mentor-questions.md) is decided (team, 2026-10-19): our own `alert_type` values are allowed, preferably scoped by the client's AML risk score, so the choice is ours: its own `alert_type` `TAIL_PAYMENT_COUNTRY`, or a priority factor on A and B alerts of the same client (section 6). The current default in [candidates.md](candidates.md) is no new alert type.

## 1. Detect (code)

`z = ln(amount / (exp_vol / exp_cnt))`: how far a payment sits above the client's declared average payment, in standard deviations of the log amount. The baseline is per client per currency: on this data that is the raw `amount` against the declared ticket, because the generator drew amounts without regard to currency. In production both sides are CZK and the two readings coincide. This is a modelling call the team must confirm; a real per-currency baseline needs per-currency history the Q2 columns don't have.

A payment fires when `z` is above `f_z_min` and one of two country facts holds:

- **T2a, far inflow:** direction `in` and the counterparty country is in `f_far_countries`.
- **T2b, only foreign payment:** direction `out` or `remit`, the counterparty country is not CZ or SK, and it is the client's only July transaction with that country (both directions counted).

| Parameter          | Value                                          | Unit                                                    | Source                                                                    | Status             |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------ |
| `f_z_min`          | 3.0 (1 in 741 per payment)                     | z, strictly above                                       | data run; looser cut 2.5                                                  | default (data run) |
| `f_far_countries`  | CN, US, JP, TR, KR, IN, CA, BR, AU, MX, SG, ZA | ISO codes                                               | outside the EEA, CH and GB                                                | default (data run) |
| `f_single_country` | 1                                              | transactions with that country in July, both directions | data run; Q2 has no per-country data, so "never before" cannot be claimed | default (data run) |
| `f_t1_z_gate`      | 4.0 (1 in 31,574 per payment)                  | z, strictly above                                       | data run (T1)                                                             | default (data run) |

The far list here leaves out GB and CH; [rule G](G-unusual-corridor.md) counts them as outside the EU and EEA. The team should pick one list for both.

T1 (any payment with `z` above 4, with or without a country fact) does not fire rule F on its own. Every T1 payment is also above 2x the Q2 maximum (`q2_max` is at most 8x the ticket, and `e^4` is about 55), so rule A already alerts on it unless the client had no Q2 activity; T1 enters rule A's priority instead ([priority.md](priority.md)).

## 2. Facts (code)

| Fact                  | Meaning                                             | Unit or band                                                                 |
| --------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `variant`             | `T2a far inflow` or `T2b only payment to country`   | enum                                                                         |
| `z`                   | As defined above                                    | number                                                                       |
| `rarity_band`         | `1 - Φ(z)` as "1 in N payments for this client"     | `1 in 700 to 5,000`, `1 in 5,000 to 30,000`, `1 in 30,000 to 300,000`, rarer |
| `size_vs_ticket_band` | `amount / (exp_vol / exp_cnt)`, same currency basis | `20 to 50 times`, `50 to 150 times`, above 150 times                         |
| `amount_czk`          | The payment at the ČNB fixing                       | CZK, for `reason` only                                                       |
| `cp_country`          | Counterparty country                                | ISO code and name                                                            |
| `country_history`     | The client's July transactions with that country    | `only transaction this month`, or a count band                               |
| `t1_hit`              | `z` above `f_t1_z_gate`                             | bool                                                                         |

No monthly-volume multiple goes into `reason` or `state` on this data: it would set an amount in its own currency against a CZK declaration.

## 3. Gates (code)

| Gate                   | Outcome | Basis                                                                           |
| ---------------------- | ------- | ------------------------------------------------------------------------------- |
| `t1_hit` (z above 4)   | REVIEW  | A 1-in-31,574 payment for this client; no automated closure; default (data run) |
| Client is a PEP        | REVIEW  | No source allows auto-closing PEP alerts                                        |
| AML risk score is high | REVIEW  | AMLA draft para 78                                                              |
| Tenure under 90 days   | REVIEW  | Same gate as rule A; default (data run)                                         |

## 4. Judgements (Jev)

Both questions go in one request. For T2a the state says "incoming from {country}".

State (illustrative, bands only):

```json
{
  "client": {
    "type": "natural person",
    "country": "CZ",
    "aml_risk_rating": "low",
    "onboarding": "in person",
    "relationship_band": "over 3 years",
    "declared_monthly_volume": "CZK 100k to 250k"
  },
  "payment": {
    "direction": "outgoing remittance",
    "counterparty_country": "Ireland",
    "country_history": "only transaction with this country this month; most of the client's payments go to CZ and SK",
    "size_vs_declared_average_payment": "50 to 150 times larger (same currency basis)",
    "rarity_for_this_client": "1 in 5,000 to 30,000 payments"
  }
}
```

Questions:

```json
{
  "plausible_for_profile": {
    "type": "noul",
    "instructions": "Given `client` and `payment`, is a one-off payment of this size, in this direction, with this country plausible for this type of client, given its declared monthly volume and home country?",
    "criteria": {
      "true": "Ordinary for such a client: for example study or property costs abroad, a foreign employer, buyer or customer, an inheritance, family abroad, or a supplier in that country",
      "false": "Hard to explain for such a client: the country has no evident link to the client and the size is out of proportion, so the source and purpose of the funds need checking"
    }
  },
  "country_link": {
    "type": "score",
    "instructions": "Given `client` and `payment.counterparty_country`, how natural is a link between a client of this type and home country and that counterparty country?",
    "criteria": [
      "No ordinary reason for this client to deal with that country",
      "Possible but unusual for this client type",
      "Common for this client type: a neighbour, a major trade partner, a typical diaspora or study destination"
    ]
  }
}
```

## 5. Triage policy (code)

| Condition                                                               | Triage |
| ----------------------------------------------------------------------- | ------ |
| Any gate                                                                | REVIEW |
| `plausible_for_profile` ≥ `f_close_p` and `country_link` ≥ `f_link_min` | FP     |
| Anything else                                                           | REVIEW |

| Parameter          | Value      | Status                                                                |
| ------------------ | ---------- | --------------------------------------------------------------------- |
| `f_close_p`        | 0.85       | default, tune on labels (tails proposal 0.8)                          |
| `f_link_min`       | 1.5        | default; between "possible" and "common"; a threshold, not a fraction |
| `f_uncertain_band` | 0.4 to 0.6 | default; flagged "Jev uncertain" in `reason`                          |

## 6. Priority

Inputs to [priority.md](priority.md), default (data run):

- On rule A and rule B alerts of the client: +5 when the client has a rule F hit, +5 more when `plausible_for_profile` is below 0.3.
- T1 sets rule A's amount points by the client's largest `z` (formula in [priority.md](priority.md)).

On rule B with an older-list demo (TR, ZA), rule F adds the question the list match alone can't answer: is this size plausible with that country?

## 7. Route

Proposed row "F, G" in [escalation.md](escalation.md), which follows "A, REVIEW" and "A, FP".

## Reason template

> Rule F ({variant}): {direction} {amount} {currency} on {date} {to or from} {cp_country}, {country_history}; {size_vs_ticket_band} this client's declared average payment, a {rarity_band} payment for its own profile (threshold 1 in 741). CZK {amount_czk} at the ČNB fixing. Jev ({model}): plausible p = {plausible_for_profile}, country link {country_link}. {decision_sentence}

Example from the data run: "Remittance of EUR 486,044 on 18 Jul to IE, the client's only transaction with Ireland this month; a 1-in-22,000 payment size for this client. CZK 11.8 M at the ČNB fixing."

## Test cases

Declared ticket 3,000 in every case (`e^3` gives 60,257; `e^4` gives 163,794).

| Case                        | Input                                                 | Expected                                   |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| At the z cut                | Inflow from CN of 60,257                              | Does not fire (z 3.0, not strictly above)  |
| Far inflow                  | Inflow from CN of 61,000                              | Fires T2a (z 3.012)                        |
| Near inflow                 | Inflow from DE of 61,000                              | Does not fire (DE not far)                 |
| Only payment to a country   | Remittance to IE of 61,000, no other IE transaction   | Fires T2b                                  |
| Second payment to a country | As above, plus one inflow from IE                     | Does not fire (2 transactions with IE)     |
| Domestic                    | Outflow to SK of 61,000, only SK transaction          | Does not fire (CZ and SK excluded)         |
| T1 gate                     | Inflow from US of 170,000                             | Fires T2a (z 4.037); REVIEW by the T1 gate |
| Plausible close             | T2b hit, risk low, tenure 3 years, p = 0.90, link 1.8 | FP                                         |
| Weak link                   | Same, link 0.9                                        | REVIEW                                     |

## Open questions

Currency conversion (2) and further red flags as alerts (5) are decided (team, 2026-10-19, [mentor-questions.md](../challenge/mentor-questions.md)). Open: may the per-client baseline be read per currency, as the generator drew it?

## Change log

What to expect under the generator: amounts are `exp_vol / exp_cnt × exp(N(0,1))`, and country is drawn per transaction independent of amount. So the joint expectation is the product of the tail probability and the country fact's share, and the observed counts match it. Every count below is a chance rate on synthetic data. The value is the stated tail probability and the question, not a planted case.

| Date       | Change                         | Alerts                                                                    | FP share | Agreement (n) |
| ---------- | ------------------------------ | ------------------------------------------------------------------------- | -------- | ------------- |
| 2026-10-19 | Data run, T2 at z above 3      | 49 tx / 49 clients (T2a 12, T2b 37); null 34.4 analytic, 36.0 permutation | n/a      | n/a           |
| 2026-10-19 | Data run, T2 at z above 2.5    | 150 tx (T2a 29, T2b 121 tx / 120 clients); null 158.1 (33.6 and 124.5)    | n/a      | n/a           |
| 2026-10-19 | Data run, T1 gate at z above 4 | 12 tx / 12 clients; null 12.6                                             | n/a      | n/a           |

At z above 3, T2a is 12 against 7.3 analytic and 7.5 permutation; T2b is 37 against 27.1 and 28.5. Both sit at P about 0.05 to 0.06 and the excess disappears at 2.5, so we read it as noise. Overlap at z above 3: T2a high risk 0, PEP 0, tenure under 90 days 1, distant 3; T2b high 2, PEP 0, tenure under 90 days 2, distant 9. Base rates, no enrichment.

Top cases. T2a: K001859 TX000145919 (US, USD 282,180, z 4.18), K002964 TX000170062 (CN, z 4.05), K004970 TX000376059 (CN, 3.66), K005326 TX000159476 (JP, 3.53), K002456 TX000033099 (IN, 3.38). T2b: K000024 TX000227445 (IE remittance EUR 486,044, 3.92), K003326 TX000235488 (AT remittance, 3.74), K000717 TX000389788 (NO, 3.59), K004046 TX000298823 (NL, 3.58), K001030 TX000252556 (TR, high risk, 3.43). T1: K003732 TX000104688 (z 4.99, CZK 4.10 M) heads the 12.
