# Rule A: client profile discrepancy

**Status:** dry run. **Owner:** unassigned. **Alert unit:** one per client.

Rule A carries the volume (one alert per client, 5,493 on the converted data) and triage is 40% of the FINREG grade. This is where the rules need the most design work and where Jev earns its place.

## Source

> Daily volume in July 2026 is greater than 25% of the projected monthly volume, or greater than 3x the average daily volume in Q2 2026; or a single transaction is greater than 2x the maximum transaction in Q2 2026. Clients inactive in Q2 2026 are compared to projected volumes only.

Client volume is the sum of all of a client's transactions regardless of direction. All amounts are converted to CZK.

## 1. Detect (code)

For each client and each July day, compute the day's volume in CZK. The client gets one alert if any day or any transaction trips a branch.

| Parameter                   | Value                                        | Unit                  | Source                                                                                        | Status            |
| --------------------------- | -------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- | ----------------- |
| `a_day_vs_expected_monthly` | 0.25                                         | ratio, strictly above | brief                                                                                         | brief             |
| `a_day_vs_q2_avg_day`       | 3                                            | ratio, strictly above | brief                                                                                         | brief             |
| `a_tx_vs_q2_max`            | 2                                            | ratio, strictly above | brief                                                                                         | brief             |
| `expected_volume_period`    | month                                        |                       | data: Q2 real over expected has median 3.36 ([data-profile.md](../challenge/data-profile.md)) | confirmed by data |
| `q2_days`                   | 91                                           | calendar days         | our choice                                                                                    | default (ask)     |
| `q2_baseline_prorated`      | yes                                          | days since contract   | ČNB p. 6, EBA 9.6(a)(v)                                                                       | default (ask)     |
| `fx_rate`                   | ČNB fixing on or before the transaction date |                       | Act §54(3)                                                                                    | law               |
| `inactive_in_q2`            | Q2 count is 0                                | expected branch only  | brief                                                                                         | brief             |

Prorating: a client contracted on 1 June 2026 has 30 days in Q2, so its Q2 average day is the Q2 volume divided by 30, not 91.

## 2. Facts (code)

| Fact                      | Meaning                                                    | Unit or band                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branches_fired`          | Which of the three branches tripped                        | list                                                                                                                                                            |
| `worst_day`               | July day with the highest ratio                            | date                                                                                                                                                            |
| `day_vs_expected_monthly` | Worst day volume over expected monthly volume              | ratio                                                                                                                                                           |
| `day_vs_q2_avg_day`       | Worst day volume over the (prorated) Q2 average day        | ratio                                                                                                                                                           |
| `tx_vs_q2_max`            | Largest July transaction over the Q2 maximum               | ratio                                                                                                                                                           |
| `breach_days`             | July days on which any day branch tripped                  | count of 31                                                                                                                                                     |
| `czk_day_vs_q2_avg_day`   | As above, CZK payments only                                | ratio                                                                                                                                                           |
| `czk_tx_vs_q2_max`        | As above, CZK payments only                                | ratio                                                                                                                                                           |
| `czk_spike_band`          | Band of the CZK-only facts                                 | `normal` (CZK day at most 3x, CZK transaction at most 2x), `elevated` (CZK day above 3x, up to 10x), `extreme` (CZK day above 10x, or CZK transaction above 2x) |
| `fx_share`                | Share of July CZK-equivalent volume in foreign currency    | 0 to 1                                                                                                                                                          |
| `cross_border_share`      | Share of July volume with a foreign payer or payee country | 0 to 1                                                                                                                                                          |
| `relationship_years`      | Years from the contract date to 1 July 2026                | years, and band `new` (< 1), `established` (1 to 3), `long` (> 3)                                                                                               |
| `contracted_in_q2`        | Contract signed on or after 1 April 2026                   | bool                                                                                                                                                            |
| `other_alerts`            | Rule B or C alerts on the same client                      | list                                                                                                                                                            |

Why the CZK-only facts: the generator drew amounts without regard to currency, and the Q2 statistics behave like unconverted amounts. After conversion every client trips rule A; on CZK payments alone, 2,003 clients have a single payment above 2x the Q2 maximum or a day above 10x the Q2 average day. The converted ratios decide that the alert fires, as the brief says; the CZK-only facts decide how worrying it is. The 10x cut-off is an illustration from the dry run, not a tuned value.

## 3. Gates (code)

| Gate                                | Outcome | Basis                                                                 |
| ----------------------------------- | ------- | --------------------------------------------------------------------- |
| Client is a PEP                     | REVIEW  | No source allows auto-closing PEP alerts                              |
| AML risk score is high              | REVIEW  | AMLA draft para 78: no automated closure for higher risk              |
| Client also has a rule B or C alert | REVIEW  | Linked transactions are a suspicion factor (AMLR Art. 69(2)); default |
| Client was inactive in Q2           | REVIEW  | Activity after dormancy (EBA 9.6(b)(iv)); one client; default         |

## 4. Judgements (Jev)

Both questions go in one request; they run in parallel. Everything else about the client is a fact in `state`.

State (illustrative values):

```json
{
  "client": {
    "type": "legal entity",
    "country": "CZ",
    "contract_channel": "in person",
    "relationship_years": 4.2,
    "relationship_band": "long",
    "aml_risk_score": "low",
    "expected_monthly_volume_czk": 120000
  },
  "alert": {
    "branches_fired": ["day_vs_q2_avg_day", "tx_vs_q2_max"],
    "day_vs_q2_avg_day": 91,
    "tx_vs_q2_max": 18,
    "breach_days": 17,
    "czk_day_vs_q2_avg_day": 2.4,
    "czk_tx_vs_q2_max": 1.3,
    "czk_spike_band": "normal",
    "fx_share": 0.91,
    "cross_border_share": 0.35
  },
  "note": "Converted ratios are inflated by foreign-currency payments. czk_spike_band is computed on CZK payments only and is the better guide to real change."
}
```

Questions:

```json
{
  "profile_consistent": {
    "type": "noul",
    "instructions": "An AML analyst reviews a rule A alert: the client's July activity tripped a volume threshold. Given `client` and `alert`, is the activity plausibly consistent with this client's profile, so the analyst would close the alert as a false positive?",
    "criteria": {
      "true": "The change is explainable by the client type, size, relationship history and risk score; czk_spike_band is normal or elevated without other concerns",
      "false": "The change is out of character for this profile, or nothing in the profile explains it"
    }
  },
  "anomaly_severity": {
    "type": "score",
    "instructions": "How unusual is the July activity for this specific client, judged from `client` and `alert`?",
    "criteria": [
      "Routine: within normal variation for this type of client",
      "Unusual: a noticeable change an analyst would look at but likely explain",
      "Out of character: activity this client's profile does not explain",
      "Alarming: a pattern typical of laundering for this kind of client"
    ]
  }
}
```

The relationship length and risk score mitigator (EBA 9.7(a)) is a fact in `state`, not a question: years and a score are computable, and asking Jev to compare numbers is its weak spot.

## 5. Triage policy (code)

| Condition                                                          | Triage |
| ------------------------------------------------------------------ | ------ |
| Any gate                                                           | REVIEW |
| `profile_consistent` ≥ `a_close_p_low` and risk score is low       | FP     |
| `profile_consistent` ≥ `a_close_p_medium` and risk score is medium | FP     |
| Anything else                                                      | REVIEW |

| Parameter          | Value      | Status                                       |
| ------------------ | ---------- | -------------------------------------------- |
| `a_close_p_low`    | 0.85       | default, tune on labels                      |
| `a_close_p_medium` | 0.95       | default, tune on labels                      |
| `a_uncertain_band` | 0.4 to 0.6 | default; flagged "Jev uncertain" in `reason` |

Every FP is sampled for human verification afterwards (ČNB benchmark 2/2023 accepts automated closure that is "subsequently verified"). The sample rate is an open question for ČNB.

## 6. Priority

Inputs to [priority.md](priority.md): `czk_spike_band` (amount or volume), `1 - profile_consistent` and `anomaly_severity` (conduct discrepancy), plus the client factors every rule shares. No floor of its own.

## 7. Route

Row A in [escalation.md](escalation.md).

## Reason template

> Rule A: {branches_fired}. Worst day {worst_day}: {day_vs_expected_monthly}x the expected monthly volume (threshold 0.25), {day_vs_q2_avg_day}x the Q2 average day (threshold 3). On CZK payments alone: {czk_day_vs_q2_avg_day}x the Q2 average day, largest payment {czk_tx_vs_q2_max}x the Q2 maximum ({czk_spike_band}). Client: {type}, {relationship_years} years, contract {contract_channel}, risk {aml_risk_score}. Jev ({model}): consistent with profile p = {profile_consistent}. {decision_sentence}

`decision_sentence` names the deciding rule of the policy table, for example "Closed as FP: low risk, no other alerts, p above 0.85; queued for QA sampling."

## Test cases

| Case                   | Input                                                    | Expected                             |
| ---------------------- | -------------------------------------------------------- | ------------------------------------ |
| Expected-volume branch | Expected monthly 100,000; a July day of 30,000           | Fires (0.30 > 0.25)                  |
| At the threshold       | Expected monthly 100,000; best day 25,000                | Does not fire (not strictly above)   |
| Q2 day branch          | Q2 volume 910,000 over 91 days; a July day of 31,000     | Fires (3.1 > 3)                      |
| Single transaction     | Q2 max 50,000; one payment of 100,001                    | Fires                                |
| Inactive in Q2         | No Q2 transactions; expected 100,000; best day 20,000    | Does not fire (expected branch only) |
| Prorated baseline      | Contract 1 June; Q2 volume 300,000; a July day of 31,000 | Q2 average day 10,000; fires (3.1)   |
| Conversion             | 1,000 EUR at a fixing of 24.50                           | 24,500 CZK                           |
| PEP gate               | PEP client, Jev p = 0.99                                 | REVIEW                               |
| Low-risk close         | No gate, risk low, p = 0.90                              | FP                                   |
| Medium-risk hold       | No gate, risk medium, p = 0.90                           | REVIEW                               |

## Open questions

In [mentor-questions.md](../challenge/mentor-questions.md): currency conversion (2), how triage is graded (4), Q2 day count, prorating clients contracted in Q2, and what goes in `transaction_id` for a per-client alert (default: the largest transaction on the worst day).

## Change log

| Date       | Change                                    | Alerts               | FP share | Agreement (n) |
| ---------- | ----------------------------------------- | -------------------- | -------- | ------------- |
| 2026-10-19 | Dry run as written, converted to CZK      | 5,493 (every client) | n/a      | n/a           |
| 2026-10-19 | Same, not converted (for comparison only) | 4,669                | n/a      | n/a           |
