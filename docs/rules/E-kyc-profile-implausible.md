# Rule E: declared profile implausible for the client type

**Status:** proposal, data run 2026-10-19. **Owner:** unassigned. **Alert unit:** one per client.

A novel rule, not in the brief. It asks whether the profile a client declared at onboarding is plausible for its type: a private individual who declares company-sized turnover, a sole trader who declares what a mid-sized company does, a company that declares almost nothing. Rule A cannot reach the large-profile clients, because it measures July against the declaration; a client whose July matches a large declaration ranks last.

## Source

Our proposal from the data run (kyc results, candidate 1). Not a brief rule. It answers the brief's "include any further red flags you identify".

- Typology: inconsistency with the declared profile, applied to the declaration itself. AMLR Art. 26(1) and 69(2) [1] (consistency with the customer's knowledge and risk profile); FATF CEF "frequent and large transactions ... inconsistent with the account holder's economic profile" [9]; EBA 9.6(b)(iii) [G2] (volume unexpected from the information given at opening). Sources in [aml-pattern-research.md](../challenge/aml-pattern-research.md) section 1 and [aml-legal-sources.md](../challenge/aml-legal-sources.md).
- Threshold basis: a documented percentile of the client's own type, the approach ČNB benchmark 2/2023 asks for (segment-specific limits backed by an internal analysis).
- Peer groups may set a threshold, but a normal-looking peer group is no reason to dismiss one client's red flag (AMLA draft paras 54 and 55 [2]).

Two uses, pending [mentor question 5](../challenge/mentor-questions.md): its own `alert_type` `KYC_PROFILE_IMPLAUSIBLE`, or a priority factor on A, B and C alerts of the same client (section 6). The current default in [candidates.md](candidates.md) is no new alert type.

## 1. Detect (code)

Percentiles are per client type over the whole client table. Sub-rules are checked in the order below; a client gets the first that matches.

| Parameter          | Value                                                                                                                                 | Unit                               | Source                                                         | Status             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- | ------------------ |
| `e_np_volume_pct`  | P99 of natural persons (CZK 825,928 a month)                                                                                          | `exp_vol`, at least                | data run, type percentile                                      | default (data run) |
| `e_np_ticket_min`  | 18,600 (all-client P99 18,639)                                                                                                        | CZK, `exp_vol / exp_cnt`, at least | data run, type-independent percentile                          | default (data run) |
| `e_ent_volume_pct` | P90 of legal entities (CZK 1,101,443 a month)                                                                                         | `exp_vol`, at least                | data run: "a sole trader declares what a typical company does" | default (data run) |
| `e_le_volume_pct`  | P1 of legal entities (CZK 32,875 a month)                                                                                             | `exp_vol`, at most                 | data run, type percentile                                      | default (data run) |
| `e_loose`          | NP P97.5 volume or ticket at least 13,900 (P97.5 13,896); entrepreneur at least 2x the legal-entity median; legal entity at most P2.5 | as above                           | data run, looser cut                                           | default (data run) |

The percentile values are recomputed when the client table changes; the cut is the percentile, not the CZK figure.

## 2. Facts (code)

| Fact                     | Meaning                                             | Unit or band                                                                                  |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `sub_rule`               | Which sub-rule fired                                | `np_volume`, `np_ticket`, `ent_volume`, `le_volume_low`                                       |
| `declared_turnover_band` | `exp_vol`                                           | CZK bands: under 50k, 50k to 250k, 250k to 1M, 1M to 2M, above 2M                             |
| `declared_ticket_band`   | `exp_vol / exp_cnt`                                 | CZK bands: under 1k, 1k to 5k, 5k to 10k, 10k to 20k, above 20k                               |
| `declared_count_band`    | `exp_cnt`                                           | under 20, 20 to 50, 50 to 100, above 100                                                      |
| `turnover_vs_peers`      | Type percentile of `exp_vol`                        | `above P99 of type`, `above P97.5 of type`, `above P90 of companies`, `below P1 of companies` |
| `july_vs_declared_band`  | July volume over `exp_vol` (raw amount, see rule A) | `in line` (0.5x to 2x), `above` (2x to 10x), `far above` (above 10x)                          |
| `rule_a_gap_pct`         | Peer percentile of rule A's count gap               | 0 to 1                                                                                        |
| `relationship_band`      | Tenure                                              | as in [rule D](D-kyc-rating-inconsistent.md)                                                  |

## 3. Gates (code)

| Gate                   | Outcome | Basis                                    |
| ---------------------- | ------- | ---------------------------------------- |
| Client is a PEP        | REVIEW  | No source allows auto-closing PEP alerts |
| AML risk score is high | REVIEW  | AMLA draft para 78                       |
| Tenure under 90 days   | REVIEW  | Same gate as rule A; default (data run)  |

## 4. Judgements (Jev)

Both questions go in one request. Code computes every band; Jev compares no numbers.

State (illustrative, bands only):

```json
{
  "client": {
    "type": "private individual",
    "residence": "other EU or EEA (Germany)",
    "onboarding": "remote (distant form)",
    "relationship_band": "3 to 12 months",
    "aml_risk_rating": "low"
  },
  "declared_profile": {
    "monthly_turnover": "CZK 1M to 2M (about EUR 40 to 80 thousand)",
    "payments_per_month": "50 to 100",
    "average_payment": "CZK 10k to 20k",
    "turnover_vs_peers": "above 99% of private individuals at this bank"
  },
  "july": {
    "turnover_vs_declared": "in line with the declaration"
  }
}
```

Questions:

```json
{
  "profile_plausible": {
    "type": "noul",
    "instructions": {
      "question": "A KYC analyst at a Czech retail bank reviews the profile in `declared_profile` that this client gave at onboarding. Is it plausible for a client of this type without extra explanation? Use the bands as given; do not recompute them.",
      "guidance": [
        "A private individual's turnover normally comes from salary, savings and household spending; millions of CZK a month need an explanation such as business income, a property sale or an inheritance.",
        "A sole trader's turnover should look like a small business, not a mid-sized company.",
        "A company with almost no turnover may be dormant or a shell.",
        "Remote onboarding, residence abroad and a short relationship make an unexplained profile less acceptable, not more."
      ]
    },
    "criteria": {
      "true": "A typical client of this type could have this profile; nothing needs documenting beyond standard due diligence",
      "false": "The profile needs a documented source of funds, source of wealth or business purpose before it can be accepted"
    }
  },
  "missing_explanation": {
    "type": "choice",
    "instructions": "Given `client` and `declared_profile`, which document would a KYC analyst ask for first to make this declared profile plausible?",
    "criteria": {
      "none_needed": "The profile is ordinary for this client type",
      "source_of_funds": "Proof of income or of where the regular turnover comes from",
      "business_activity": "Business registration and a description of the activity behind the turnover",
      "source_of_wealth": "Evidence of a one-off origin such as a property sale or an inheritance",
      "ownership_and_purpose": "Beneficial owners and the purpose of the company, for a company that declares almost no activity"
    }
  }
}
```

The option order of `missing_explanation` is fixed as written and logged.

## 5. Triage policy (code)

| Condition                                     | Triage |
| --------------------------------------------- | ------ |
| Any gate                                      | REVIEW |
| `profile_plausible` ≥ `e_close_p` and no gate | FP     |
| Anything else                                 | REVIEW |

| Parameter          | Value      | Status                                       |
| ------------------ | ---------- | -------------------------------------------- |
| `e_close_p`        | 0.85       | default, tune on labels                      |
| `e_uncertain_band` | 0.4 to 0.6 | default; flagged "Jev uncertain" in `reason` |

REVIEW here is a KYC refresh: the analyst requests the document named by `missing_explanation`.

## 6. Priority

Inputs to [priority.md](priority.md), as a conduct discrepancy on any A, B or C alert of the client, default (data run):

- `profile_plausible` at most 0.3: +10.
- `profile_plausible` above 0.3 and at most 0.5: +5.

On rule A this lifts exactly the clients rule A's ratio buries. Natural persons at or above the volume P99 have a median July volume at the 96th percentile of natural persons, but a median rule A count gap at the 5th percentile of their peer group (`pr_gap` 0.05). Entrepreneurs at or above the legal-entity P90: July volume P98, gap P22. Their July matches what they declared, so a ratio against the declaration ranks them last. The question "is the declaration itself plausible?" is the only check that reaches them.

Overlap with existing facts: 16 of the 18 natural persons with a large ticket also have the raw largest payment at or above peer P95 (rule A fact `max_tx_raw_peer_pct`); 8 of the 26 small legal entities also have a count or amount gap at or above peer P95 (a small declared count). As a factor it partly repeats those; the volume sub-rules are new.

## 7. Route

Proposed row "D, E (rating or profile review)" in [escalation.md](escalation.md).

## Reason template

By sub-rule (code fills the bands):

> Rule E (np_volume): private individual declared CZK {declared_turnover_band} a month at onboarding, more than 99% of private individuals. July volume CZK {jul_czk} is {july_vs_declared_band} the declaration, so rule A ranks this client low (gap percentile {rule_a_gap_pct}). Jev ({model}): profile plausible p = {profile_plausible}; first document to request: {missing_explanation}. {decision_sentence}

- `np_ticket`: "Private individual declared an average payment of CZK {declared_ticket_band}, more than 99% of all clients."
- `ent_volume`: "Sole trader declared CZK {declared_turnover_band} a month, more than 90% of companies."
- `le_volume_low`: "Company declared CZK {declared_turnover_band} a month, less than 99% of companies; July volume is {july_vs_declared_band} that."

## Test cases

| Case                        | Input                                             | Expected                |
| --------------------------- | ------------------------------------------------- | ----------------------- |
| NP volume at the cut        | NP, `exp_vol` 825,928                             | Fires (at least P99)    |
| NP volume below             | NP, `exp_vol` 800,000, ticket 5,000               | Does not fire           |
| NP ticket at the cut        | NP, `exp_vol` 186,000, `exp_cnt` 10               | Fires (ticket 18,600)   |
| Entrepreneur, company-sized | Entrepreneur, `exp_vol` 1,200,000                 | Fires (above 1,101,443) |
| Legal entity at the cut     | LE, `exp_vol` 32,875                              | Fires (at most P1)      |
| Legal entity above          | LE, `exp_vol` 40,000                              | Does not fire           |
| Order of sub-rules          | NP, `exp_vol` 900,000, ticket 20,000              | `np_volume` only        |
| High-risk gate              | NP volume hit, risk high, p = 0.95                | REVIEW                  |
| Plausible close             | NP volume hit, risk low, tenure 3 years, p = 0.90 | FP                      |

## Open questions

In [mentor-questions.md](../challenge/mentor-questions.md): further red flags as alerts or factors (5). New: does a KYC refresh count as an alert outcome for FINREG, or only as a decision log note?

## Change log

What to expect under the generator: the declared ticket is one lognormal (mean of ln 8.0, sd 0.8) for every type, and the declared count is lognormal per type. A cut at a type's own P99 or P1 therefore fires on about 1% of that type by construction (natural persons 2,594, legal entities 2,551, entrepreneurs 348). These are tail draws, not planted cases. The value is the stated percentile and the plausibility question, not the count.

| Date       | Change                | Alerts                                                       | FP share | Agreement (n) |
| ---------- | --------------------- | ------------------------------------------------------------ | -------- | ------------- |
| 2026-10-19 | Data run, strict cuts | 80 (NP volume 26, NP ticket 18, entrepreneur 10, LE low 26)  | n/a      | n/a           |
| 2026-10-19 | Data run, loose cuts  | 212 (NP volume 65, NP ticket 38, entrepreneur 45, LE low 64) | n/a      | n/a           |

Overlap, strict 80: high risk 5, PEP 0, tenure under 90 days 2, distant 17, outside EU and EEA 3. Loose 212: high 13, PEP 2, tenure under 90 days 12, distant 43.

Top cases (largest July payment as proof): NP volume K002687 (TX000091015), K005103 (TX000162737), K004200 (TX000260695), K004910 (TX000017946); NP ticket K000909 (TX000025982), K001988 (TX000382659), K000765 (TX000105541), K000068 (TX000046869); entrepreneur K003487 (TX000299979, the largest declared ticket in the table), K005113 (TX000145303); legal entity low K004225 (TX000216453, July 34x declared), K001676 (TX000235034, the smallest legal-entity volume). The entrepreneur sub-rule mixes two stories (K003487 a ticket outlier, K005113 a volume outlier); the reason names each case's own oddity.
