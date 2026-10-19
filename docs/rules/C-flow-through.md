# Rule C: flow-through account

**Status:** approximate. **Owner:** unassigned. **Alert unit:** one per client.

## Source

> Within 24 hours the client receives incoming payments above CZK 100,000 and within 6 hours sends out at least 80% of that amount to another account (not the payer's account). Include any further red flags you identify.

## 1. Detect (code)

For each incoming payment, open a 24-hour window ending at it and sum the incoming payments inside. If the sum is above the threshold, sum the outgoing payments in the 6 hours after the window's last inflow, counting only payees that were not payers in the window. The client gets one alert if any window qualifies; the strongest window (highest forwarded share) goes into the facts.

| Parameter             | Value                                   | Unit                  | Source                                                           | Status        |
| --------------------- | --------------------------------------- | --------------------- | ---------------------------------------------------------------- | ------------- |
| `c_in_window_hours`   | 24, floating                            | hours                 | brief; floating is our reading                                   | default (ask) |
| `c_in_min_czk`        | 100,000, on the window's sum            | CZK, strictly above   | brief; "sum" is our reading                                      | default (ask) |
| `c_out_window_hours`  | 6, starting at the window's last inflow | hours                 | brief; start point is ours                                       | default (ask) |
| `c_forward_share_min` | 0.80                                    | out over in, at least | brief                                                            | brief         |
| `c_exclude_payers`    | payees that paid in during the window   | accounts              | brief                                                            | brief         |
| `c_remittances`       | counted as outflow; never as inflow     | no payer account      | data run: 1,077 clients with remittances as outflow, 720 without | default (ask) |

Windows cross midnight often (16,217 qualifying windows span two dates), so calendar days would miss most of them.

Data run ([data-patterns.md](../challenge/data-patterns.md)): the same rule with the outflow window placed in the 6 hours before the inflow gives the same counts (1,080 clients against 1,077; 740 against 720 without remittances). On this data rule C finds coincidences of large amounts, not planted pass-throughs, so its triage and priority rest on the facts, the scorecard and Jev.

## 2. Facts (code)

| Fact                                 | Meaning                                                     | Unit or band                                               |
| ------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `in_sum_czk`                         | Inflow in the strongest window                              | CZK                                                        |
| `out_sum_czk`                        | Qualifying outflow in the 6 hours after it                  | CZK                                                        |
| `forward_share`                      | `out_sum_czk / in_sum_czk`                                  | 0 to 1+                                                    |
| `hours_to_forward`                   | Hours from the last inflow to the outflow that crossed 80%  | hours                                                      |
| `in_count`, `distinct_payers`        | Inflow payments and distinct payer accounts                 | count                                                      |
| `out_count`, `distinct_payees`       | Qualifying outflows and distinct payee accounts             | count                                                      |
| `flow_shape`                         | From the two distinct counts                                | `one_to_one`, `one_to_many`, `many_to_one`, `many_to_many` |
| `payer_countries`, `payee_countries` | Countries of the counterparties (the account id encodes it) | list                                                       |
| `cross_border_out`                   | Share of outflow to a payee country other than the client's | 0 to 1                                                     |
| `qualifying_windows`                 | July windows that qualified                                 | count                                                      |
| `other_alerts`                       | Rule A or B alerts on the same client                       | list                                                       |

## 3. Gates (code)

| Gate        | Outcome              | Basis                                                                                              |
| ----------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| Every alert | REVIEW               | No source allows auto-closing a flow-through pattern; our escalation design never auto-closes it   |
| Every alert | Priority at least 80 | Our escalation default ([czech-aml-escalation.md](../challenge/czech-aml-escalation.md) section 6) |

## 4. Judgements (Jev)

The same pattern has different stories. Jev picks the typology; code uses it for priority and routing, never for triage.

State: the client facts as in rule A (type, country, channel, relationship, risk score, expected monthly volume) plus every fact above, in an `alert` object.

```json
{
  "typology": {
    "type": "choice",
    "instructions": "An AML analyst reviews a flow-through alert: money came into the client's account and most of it left again within hours to other accounts. Given `client` and `alert`, which pattern best describes it?",
    "criteria": {
      "payroll_pass_through": "One employer-like payer in; many individual payees out; fits a business client paying staff or contractors",
      "trade_settlement": "Inflow and outflow fit a supplier and customer chain for this client type and size",
      "own_account_sweep": "Outflow goes to accounts the state shows belong to the same client",
      "mule_pattern": "Personal or new account, fast forwarding to unrelated or foreign parties, no business reason in the profile",
      "other": "None of the above fits"
    }
  },
  "business_rationale": {
    "type": "noul",
    "instructions": "Given `client` and `alert`, does the client's profile give a plausible business reason for forwarding this money this fast?",
    "criteria": {
      "true": "Client type, size and history explain passing funds on quickly",
      "false": "Nothing in the profile explains it"
    }
  }
}
```

Notes for iteration:

- `own_account_sweep` cannot be evidenced on this data: no transaction runs between two clients, and an account id only encodes its country. Expect it near zero; drop it if the labels agree.
- `payroll_pass_through` and `trade_settlement` can be evidenced only in part: client type, payee count, amounts, payee country and the currency of each leg exist, but there is no payment purpose, industry or history beyond July. `mule_pattern` is the one typology every distinguishing fact exists for. The data run suggests Jev answer "consistent / not consistent / cannot tell" and name the missing fact, rather than return a typology label.
- Jev favours the first option in a Choice. Keep the order fixed and logged, and test once with the order reversed on the labelled set.

## 5. Triage policy (code)

Always REVIEW. Typology changes priority and route:

| Condition                                                                             | Effect                                                                           |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `typology` is `mule_pattern` or `other`, or its confidence is below `c_typology_conf` | Route to the contact person tier; flag a possible §20 hold                       |
| `business_rationale` below `c_rationale_p`                                            | Same, and the reason says an OPO is the default unless the purpose is documented |

| Parameter         | Value | Status                  |
| ----------------- | ----- | ----------------------- |
| `c_typology_conf` | 0.5   | default, tune on labels |
| `c_rationale_p`   | 0.3   | default, tune on labels |

## 6. Priority

Floor 80. Floor 90 when `typology` is `mule_pattern` (default). Other inputs to [priority.md](priority.md): `in_sum_czk`, `forward_share`, `cross_border_out`, and the client factors.

## 7. Route

Row C in [escalation.md](escalation.md).

## Reason template

> Rule C: {in_sum_czk} CZK in within 24 hours ({in_count} payments, {distinct_payers} payers), {forward_share} of it out within {hours_to_forward} hours to {distinct_payees} other accounts (threshold 80% within 6 hours). {qualifying_windows} qualifying windows in July. Jev ({model}): {typology} (confidence {typology_confidence}); business reason plausible p = {business_rationale}. Flow-through alerts always go to review.

## Test cases

| Case                | Input                                                                 | Expected                     |
| ------------------- | --------------------------------------------------------------------- | ---------------------------- |
| Qualifies           | 60,000 + 50,000 in within 24 h; 90,000 out 3 h later to a new account | Fires (0.818)                |
| Below share         | Same, 85,000 out                                                      | Does not fire (0.773)        |
| Back to the payer   | Same, 90,000 out to one of the two payers                             | Does not fire (excluded)     |
| Inflow at threshold | 100,000 in exactly                                                    | Does not fire                |
| Too late            | 110,000 in; 90,000 out 6 h 1 min after the last inflow                | Does not fire                |
| Across midnight     | 110,000 in at 22:00 and 23:30; 90,000 out at 01:00                    | Fires                        |
| Mule floor          | Fires, Jev `mule_pattern`                                             | REVIEW, priority at least 90 |

## Open questions

In [mentor-questions.md](../challenge/mentor-questions.md): floating window or calendar days and the meaning of "another account", whether "above CZK 100,000" is the sum or each payment, how remittances count, and the extra red flags (5, see [candidates.md](candidates.md)).

## Change log

| Date       | Change                                                                                                      | Alerts        | FP share       | Agreement (n) |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ------------- | -------------- | ------------- |
| 2026-10-19 | Approximate dry run, converted                                                                              | 1,077 clients | 0 (all REVIEW) | n/a           |
| 2026-10-19 | Same, not converted (for comparison only)                                                                   | 16 clients    | 0              | n/a           |
| 2026-10-19 | Data run, variant A (floating 24 h, 6 h after each inflow), remittances as outflow; without remittances 720 | 1,077 clients | 0 (all REVIEW) | n/a           |
| 2026-10-19 | Data run, variant B (calendar day, 6 h after the day's last inflow); without remittances 408                | 631 clients   | n/a            | n/a           |
| 2026-10-19 | Data run, variant B2 (calendar day, same-day outflow); without remittances 1,174                            | 1,660 clients | n/a            | n/a           |
| 2026-10-19 | Data run, variant C (single inflow above 100,000); without remittances 490                                  | 758 clients   | n/a            | n/a           |
| 2026-10-19 | Data run, variant A with the 6 h outflow window before the inflow (null model); without remittances 740     | 1,080 clients | n/a            | n/a           |
