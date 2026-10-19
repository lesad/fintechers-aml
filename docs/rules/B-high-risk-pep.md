# Rule B: high-risk jurisdiction or PEP

**Status:** dry run. **Owner:** unassigned. **Alert unit:** one per transaction.

Rule B is fully deterministic. It needs no Jev question: the country branch fires zero times on this data, and every PEP alert goes to a person anyway.

## Source

> A transaction above CZK 10,000 where the payer, payee or client country is on the EU or FATF high-risk jurisdictions list; or an outgoing transaction of a Politically Exposed Person above CZK 100,000 (where direction is unclear, any transaction).

## 1. Detect (code)

Two independent branches. A transaction that trips both is one alert with both branches in `branches_fired`.

| Parameter           | Value                                                      | Unit                | Source                                          | Status            |
| ------------------- | ---------------------------------------------------------- | ------------------- | ----------------------------------------------- | ----------------- |
| `b_country_min_czk` | 10,000                                                     | CZK, strictly above | brief                                           | brief             |
| `b_country_list`    | `reference/high-risk-countries-2026-07.json`               | ISO codes           | EU list and FATF call for action, July 2026     | default (ask)     |
| `b_country_parties` | payer, payee and client country                            |                     | brief                                           | brief             |
| `b_pep_min_czk`     | 100,000                                                    | CZK, strictly above | brief                                           | brief             |
| `b_pep_direction`   | outgoing; remittances count as "direction unclear", so any |                     | brief; remittances have no payer account (data) | confirmed by data |

The list is data, so swapping it (for example adding the 2024 FATF grey list with ZA and TR) is a config change and a rerun.

## 2. Facts (code)

| Fact                | Meaning                                                     | Unit or band               |
| ------------------- | ----------------------------------------------------------- | -------------------------- |
| `branches_fired`    | `country`, `pep` or both                                    | list                       |
| `matched_parties`   | Which of payer, payee, client country matched, and the code | list of `{party, country}` |
| `list_source`       | EU, FATF call for action, or both, with the list's date     | text                       |
| `amount_czk`        | Transaction amount in CZK                                   | CZK                        |
| `direction`         | outgoing, incoming, unclear (remittance)                    | enum                       |
| `pep_tx_count_july` | The client's PEP-branch alerts in July                      | count                      |
| `other_alerts`      | Rule A or C alerts on the same client                       | list                       |

## 3. Gates (code)

| Gate        | Outcome | Basis                                                                                                                                                    |
| ----------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every alert | REVIEW  | PEP and high-risk third countries require enhanced due diligence (Act §9a, AMLR Art. 42); AMLA draft para 78 excludes higher risk from automated closure |

## 4. Judgements (Jev)

None. Every alert is REVIEW, the country branch fires zero times, and priority comes from facts. Revisit only if FINREG names a list that makes the country branch fire and asks for FP closure on it.

## 5. Triage policy (code)

Always REVIEW.

## 6. Priority

Inputs to [priority.md](priority.md): PEP, country, `amount_czk`. Floors: PEP plus a high-risk country is at least 80 (default).

## 7. Route

Row B in [escalation.md](escalation.md). A PEP relationship that is to continue needs the board AML member or their delegate (Act §9a(3)(d)).

## Reason template

> Rule B ({branches_fired}): {direction} transaction of {amount_czk} CZK (threshold {threshold}). {matched_parties_sentence} {pep_sentence} Rule B alerts always go to review: enhanced due diligence applies to PEPs and high-risk countries.

## Test cases

| Case                 | Input                                                 | Expected                                       |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| PEP outgoing above   | PEP, outgoing, 100,001 CZK                            | Fires, `pep`                                   |
| PEP at threshold     | PEP, outgoing, 100,000 CZK                            | Does not fire                                  |
| PEP incoming         | PEP, incoming, 500,000 CZK                            | Does not fire                                  |
| PEP remittance       | PEP, remittance, 150,000 CZK                          | Fires (direction unclear)                      |
| Country on list      | Non-PEP, payee country on the list, 10,001 CZK        | Fires, `country`, party payee                  |
| Country at threshold | Same, 10,000 CZK                                      | Does not fire                                  |
| Both branches        | PEP, outgoing, 200,000 CZK, payee country on the list | One alert, both branches; priority at least 80 |

## Open questions

In [mentor-questions.md](../challenge/mentor-questions.md): which high-risk list (3), the escalation matrix for PEPs (1), and whether the UI should group a client's per-transaction alerts (the data has 112 PEP alerts on 22 clients).

## Change log

| Date       | Change                                    | Alerts                          | FP share       | Agreement (n) |
| ---------- | ----------------------------------------- | ------------------------------- | -------------- | ------------- |
| 2026-10-19 | Dry run, converted, July 2026 list        | 112 PEP (22 clients), 0 country | 0 (all REVIEW) | n/a           |
| 2026-10-19 | Same, not converted (for comparison only) | 4 PEP (3 clients)               | 0              | n/a           |
