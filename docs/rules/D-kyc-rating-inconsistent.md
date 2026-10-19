# Rule D: AML risk rating inconsistent with the client's facts

**Status:** proposal, data run 2026-10-19. **Owner:** unassigned. **Alert unit:** one per client.

A novel rule, not in the brief. It checks the bank's own AML risk rating against the facts in the client file. Two branches: a PEP rated below high, decided in code by law, and a low rating that sits on top of several stacked risk factors, where Jev judges adequacy and suggests a rating.

## Source

Our proposal from the data run (kyc results, candidate 2). Not a brief rule. It answers the brief's "include any further red flags you identify".

- Typology: a client risk rating that does not reflect the client's risk factors. The rating sets the level of measures (Decree §7 [CZ2]), so a rating that is too low weakens every later check.
- PEP branch: a PEP must carry a high-risk profile, Decree §9(3) [CZ2]; FATF R.12 [G1] ([aml-legal-sources.md](../challenge/aml-legal-sources.md), priority factor table). PEP measures: AMLD Art. 20(b), AMLR Art. 42(1), Act §9a(3)(d).
- Stacked branch: non-face-to-face onboarding (Act Annex 2 (2c) [CZ1]; EBA 9.10(a) [G2]), a new client with no track record (Act §21a(2) [CZ1]; EBA 9.6(a)(v) [G2]), a high-risk third country (Decree §9(3)(a) [CZ2]) and a profile out of line with peers (EBA 9.6(b)(iii) [G2]) each raise risk.
- A rating change raises or lowers CDD intensity, which needs meaningful human intervention when automated (AMLR Art. 76(5)(b), in [aml-pattern-research.md](../challenge/aml-pattern-research.md) section 2). Jev suggests; a person decides.

Two uses, pending [mentor question 5](../challenge/mentor-questions.md): its own `alert_type` `KYC_RATING_INCONSISTENT`, or a priority factor on A, B and C alerts of the same client (section 6). The current default in [candidates.md](candidates.md) is no new alert type.

## 1. Detect (code)

Count the risk factors per client, then fire on either branch.

| Parameter           | Value                                                               | Unit              | Source                                                                             | Status             |
| ------------------- | ------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------- | ------------------ |
| `d_pep_min_rating`  | high                                                                | rating            | Decree §9(3); FATF R.12                                                            | law                |
| `d_factor_pep`      | client is a PEP                                                     | 1 point           | Decree §9(3)                                                                       | default (data run) |
| `d_factor_third`    | residence outside the EU and EEA                                    | 1 point           | Decree §9(3)(a)                                                                    | default (data run) |
| `d_factor_distant`  | contract channel distant, counted only for EU and EEA residents     | 1 point           | EBA 9.10(a); collinear with residence (data)                                       | default (data run) |
| `d_factor_new`      | tenure under 365 days                                               | 1 point           | EBA 9.6(a)(v)                                                                      | default (data run) |
| `d_factor_profile`  | a loose profile cut of [rule E](E-kyc-profile-implausible.md) holds | 1 point           | EBA 9.6(b)(iii)                                                                    | default (data run) |
| `d_low_min_factors` | 3                                                                   | factors, at least | data run: first level where low looks inconsistent and the count stays in the tens | default (data run) |

Fires when the client is a PEP and its rating is not high, or when the rating is low and the factor count is at least `d_low_min_factors`.

Distant counts only for EU and EEA residents because every client outside CZ and SK was onboarded distant in this data; counting both would give one fact two points.

## 2. Facts (code)

| Fact                | Meaning                                           | Unit or band                                                                 |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `branch_fired`      | `pep_not_high` or `low_with_factors`              | enum                                                                         |
| `current_rating`    | The client's AML risk score                       | `low`, `medium`, `high`                                                      |
| `factor_count`      | Sum of the factor points                          | count, 0 to 5                                                                |
| `factors_present`   | Names of the factors that scored                  | list                                                                         |
| `relationship_band` | Tenure                                            | `under 3 months`, `3 to 12 months`, `1 to 3 years`, `over 3 years`           |
| `residence_band`    | Residence                                         | `CZ or SK`, `other EU or EEA`, `outside EU and EEA`                          |
| `profile_band`      | Declared monthly turnover against the client type | `ordinary`, `above P97.5 of type`, `above P99 of type`, `below P2.5 of type` |

## 3. Gates (code)

| Gate                 | Outcome | Basis                                                      |
| -------------------- | ------- | ---------------------------------------------------------- |
| PEP rated below high | REVIEW  | Decree §9(3); FATF R.12. Jev is not asked; the law decides |
| Tenure under 90 days | REVIEW  | Same gate as rule A (FATF, FAÚ); default (data run)        |

A Jev answer never lowers a rating. `suggested_rating` below `current_rating` is read as `current_rating`.

## 4. Judgements (Jev)

Only the `low_with_factors` branch goes to Jev. Both questions go in one request.

State (illustrative, bands only):

```json
{
  "client": {
    "type": "private individual",
    "residence": "other EU or EEA (France)",
    "onboarding": "remote (distant form)",
    "relationship_band": "3 to 12 months",
    "pep": false,
    "current_aml_rating": "low"
  },
  "profile": {
    "declared_turnover_vs_peers": "above 97.5% of private individuals at this bank",
    "facts_raising_risk": [
      "remote onboarding",
      "relationship under 1 year",
      "declared turnover far above peers"
    ]
  }
}
```

Questions:

```json
{
  "rating_adequate": {
    "type": "noul",
    "instructions": {
      "question": "A Czech bank reviews a client's AML risk rating. Given `client` and `profile`, is the rating in `client.current_aml_rating` adequate for these facts?",
      "guidance": [
        "Remote onboarding, a relationship under one year, residence outside the EU or EEA, and a declared turnover far above peers each raise risk.",
        "Several of these together rarely fit a low rating.",
        "A long-standing client with an ordinary profile supports a low rating."
      ]
    },
    "criteria": {
      "true": "A prudent analyst would keep this rating: the facts that raise risk are few or are offset by the relationship and an ordinary profile",
      "false": "A prudent analyst would raise this rating: the facts that raise risk stack up and nothing in the file offsets them"
    }
  },
  "suggested_rating": {
    "type": "choice",
    "instructions": "Given `client` and `profile`, which AML risk rating would a prudent analyst at a Czech bank assign on these facts alone?",
    "criteria": {
      "low": "Ordinary client; the facts that raise risk are minor or offset",
      "medium": "Some facts raise risk and call for closer monitoring, but no single strong risk factor",
      "high": "The facts together, or one strong factor, call for enhanced due diligence"
    }
  }
}
```

The option order of `suggested_rating` is fixed low to high and logged; test once reversed ([jev-questions.md](jev-questions.md), rule 7).

## 5. Triage policy (code)

| Condition                                   | Triage |
| ------------------------------------------- | ------ |
| Any gate                                    | REVIEW |
| `rating_adequate` ≥ `d_close_p` and no gate | FP     |
| Anything else                               | REVIEW |

| Parameter          | Value      | Status                                       |
| ------------------ | ---------- | -------------------------------------------- |
| `d_close_p`        | 0.85       | default, tune on labels                      |
| `d_uncertain_band` | 0.4 to 0.6 | default; flagged "Jev uncertain" in `reason` |

REVIEW here means a rating review, not a suspicion investigation. The analyst records the new rating or the reason to keep it.

## 6. Priority

Inputs to [priority.md](priority.md):

- The AML risk score factor uses `max(current_rating, suggested_rating)` on every A, B and C alert of the client, inside the proposed cap on risk, country and channel.
- +5 for the inconsistency itself, default (data run).

No floor of its own. For the 14 PEPs, rule B's PEP branch already alerts on their large outgoing payments; for them the value is the corrected rating in the score and the "rating error" note in `log`, not a new alert.

## 7. Route

Proposed row "D, E (rating or profile review)" in [escalation.md](escalation.md): `l2_analyst`, approver `compliance_officer`, because the outcome changes the client's rating and CDD intensity.

## Reason template

> Rule D: {branch_fired}. Client rated {current_rating}; {factor_count} risk factors present ({factors_present}), threshold {d_low_min_factors}. Jev ({model}): rating adequate p = {rating_adequate}, suggested {suggested_rating}. {decision_sentence}

For the PEP branch: "Rule D: PEP rated {current_rating}; Czech rules require a high-risk profile for PEPs (Decree §9(3)). Rating to be reviewed."

## Test cases

| Case                         | Input                                                               | Expected                                     |
| ---------------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| PEP rated medium             | PEP, risk medium                                                    | Fires; REVIEW by gate; Jev not asked         |
| PEP rated high               | PEP, risk high                                                      | Does not fire                                |
| Low with three factors       | FR resident, distant, tenure 200 days, NP turnover above P97.5      | Fires (3 factors)                            |
| Low with two factors         | FR resident, distant, tenure 200 days, ordinary turnover            | Does not fire (2 factors)                    |
| Third-country distant client | US resident, distant, tenure 200 days, risk medium                  | Does not fire (not low; distant not counted) |
| Medium with three factors    | FR resident, distant, tenure 200 days, turnover above P97.5, medium | Does not fire at the strict cut              |
| Jev keeps the rating         | Low with three factors, tenure 200 days, p = 0.90                   | FP                                           |
| Jev suggests lower           | Current medium, `suggested_rating` low                              | Read as medium                               |

## Open questions

In [mentor-questions.md](../challenge/mentor-questions.md): further red flags as alerts or factors (5). New: does FINREG want rating errors in the alert file at all, or only in the decision log?

## Change log

The counts are what the generator's rating rule produces, not a tail statistic. In this data PEPs are never rated low (9 high, 14 medium of 23), and no client resident outside the EU and EEA is rated low (205 of 205 medium or high). Otherwise the rating is flat across ticket, volume, tenure and type, so the 6 stacked cases are the chance overlap of independent fields. No null expectation was computed. Inferred, not verified: the exact generator rule for the rating.

| Date       | Change                                                             | Alerts                                   | FP share | Agreement (n) |
| ---------- | ------------------------------------------------------------------ | ---------------------------------------- | -------- | ------------- |
| 2026-10-19 | Data run, strict: PEP not high, or low with at least 3 factors     | 20 (PEP medium 14, low with 3 factors 6) | n/a      | n/a           |
| 2026-10-19 | Data run, loose: PEP not high, or not high with at least 3 factors | 22 (adds K004910, K004995, both medium)  | n/a      | n/a           |

Overlap of the strict 20: PEP 14, high 0 (by definition), tenure under 90 days 1 (K005432, 29 days), distant 8, outside EU and EEA 0. Low-rated clients with 3 factors are 6 of 3,686 low-rated (0.16 %); none has 4.

Cases (largest July payment as proof): PEP medium K005063 (TX000214826), K002448 (TX000024511), K004364 (TX000228061), K001765, K001809, K001607, K004420, K000119, K004284, K002150, K002220, K004161, K000824, K004624. Low with 3 factors K005103 (TX000162737), K005060 (TX000242537), K005109 (TX000366523), K004972 (TX000122498), K004837 (TX000148762), K005432 (TX000065928).
