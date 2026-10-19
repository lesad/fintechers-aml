# Company-specific AML rules

**Policy version:** `ruleset-2026-10-v1`
**Implementation:** `analysis/scenarios.py` · **Runner:** `analysis/run_scenarios.py`
**Calibrated on:** 5,493 clients / 397,853 transactions (July 2026)
**Current output:** 1,163 alerts across 962 clients (17.5% of book)

18 monitoring rules. Each one is a named, versioned detector with an explicit typology
narrative, stated parameters, and structured evidence output.

**A rule never returns a risk level.** It returns an alert carrying evidence. Scoring and
disposition are separate stages, so "why did this fire" is always answerable from the
alert alone, and a threshold change never rewrites history.

## Evidence status

| status | meaning | rules |
|---|---|---|
| `VALIDATED` | Reproducible on our data with zero counter-examples | S-01, S-02 |
| `EXTERNAL_LIST` | Correctness depends on a third-party list we must keep current | S-03 |
| `CALIBRATED` | Defensible typology; threshold set by alert budget, no validated link to risk on our data | S-04 … S-18 |

**Alert budget: 1% of book per calibrated rule.** Thresholds are population quantiles, not
domain lore. This is a deliberate and stateable design choice. The alternative — asserting
that "robust z > 6 means suspicious" — is indefensible when that threshold fires on 100%
of the book, which it does here.

## Index

| id | rule | status | clients | % book |
|---|---|---|---|---|
| [S-01](#s-01--pep-relationship) | PEP relationship | `VALIDATED` | 23 | 0.42% |
| [S-02](#s-02--non-eueea-domicile) | Non-EU/EEA domicile | `VALIDATED` | 205 | 3.73% |
| [S-03](#s-03--call-for-action-jurisdiction-exposure) | Call-for-action jurisdiction exposure | `EXTERNAL_LIST` | 0 | 0.00% |
| [S-04](#s-04--enhanced-scrutiny-jurisdiction-concentration) | Enhanced-scrutiny jurisdiction concentration | `CALIBRATED` | 46 | 0.84% |
| [S-05](#s-05--single-high-value-transaction) | Single high-value transaction | `CALIBRATED` | 266 | 4.84% |
| [S-06](#s-06--activity-vs-declared-expectation) | Activity vs declared expectation | `CALIBRATED` | 54 | 0.98% |
| [S-07](#s-07--self-relative-amount-outlier) | Self-relative amount outlier | `CALIBRATED` | 54 | 0.98% |
| [S-08](#s-08--single-day-volume-spike) | Single-day volume spike | `CALIBRATED` | 71 | 1.29% |
| [S-09](#s-09--same-counterparty-splitting) | Same-counterparty splitting | `CALIBRATED` | 2 | 0.04% |
| [S-10](#s-10--multi-counterparty-structuring) | Multi-counterparty structuring | `CALIBRATED` | 10 | 0.18% |
| [S-11](#s-11--pass-through-account) | Pass-through account | `CALIBRATED` | 54 | 0.98% |
| [S-12](#s-12--rapid-movement-of-funds) | Rapid movement of funds | `CALIBRATED` | 27 | 0.49% |
| [S-13](#s-13--round-trip-with-counterparty) | Round-trip with counterparty | `CALIBRATED` | 35 | 0.64% |
| [S-14](#s-14--counterparty-country-diversity) | Counterparty-country diversity | `CALIBRATED` | 30 | 0.55% |
| [S-15](#s-15--third-currency-settlement) | Third-currency settlement | `CALIBRATED` | 21 | 0.38% |
| [S-16](#s-16--off-hours-concentration) | Off-hours concentration | `CALIBRATED` | 54 | 0.98% |
| [S-17](#s-17--counterparty-concentration) | Counterparty concentration | `CALIBRATED` | 54 | 0.98% |
| [S-18](#s-18--new-client-immediate-scale) | New client, immediate scale | `CALIBRATED` | 157 | 2.86% |

---

# A. Customer due diligence — status floors

These derive from who the customer *is*, not what they did. They constrain the outcome
rather than scoring it, which is how status-based risk works under a risk-based approach.

## S-01 · PEP relationship
`VALIDATED` · 23 clients (0.42%)

**Scenario.** A politically exposed person — or their family member or close associate —
holds an account. PEPs are not presumed criminal; they carry elevated corruption and
bribery exposure, so the relationship requires senior sign-off, source-of-wealth
evidence, and ongoing enhanced monitoring for the life of the relationship.

**Logic.** `client.pep == true`. No threshold.

**Why a floor, not a score.** In our data no PEP is ever labelled low risk — 0 of 23,
without exception. Encode that as a constraint the scoring stage cannot override.

**Disposition.** Enhanced due diligence. Senior management approval to open or continue.
Source of wealth and source of funds documented. Annual review minimum.

## S-02 · Non-EU/EEA domicile
`VALIDATED` · 205 clients (3.73%)

**Scenario.** The customer is domiciled outside the EU/EEA and therefore outside the
supervisory and information-exchange regime we rely on domestically. Verification of
identity, beneficial ownership and source of funds is harder, and legal recourse weaker.

**Logic.** `client.country NOT IN EU_EEA`.

**Why this boundary.** The strongest pattern in our data: **0 of 205** non-EU/EEA clients
are labelled low risk, against 69.7% low inside the EU/EEA; 48.3% of them are high.
Encode *membership*, not a hand-picked country list — CH (EFTA, non-EEA) and GB
(post-Brexit) correctly fall outside; NO and IS correctly fall inside.

**Disposition.** Minimum medium risk. Enhanced identity verification.

## S-03 · Call-for-action jurisdiction exposure
`EXTERNAL_LIST` · 0 clients (0.00%)

**Scenario.** The customer transacts with a jurisdiction subject to a FATF call for
action — the most severe category, where countermeasures may be legally mandated rather
than discretionary.

**Logic.** Any transaction whose counterparty country is on the Tier-3 list. A single
transaction is enough.

**Zero firings is a configuration fact, not a clean bill of health.** Our Tier-3 list is
empty because no country in our book is currently believed FATF-listed. **This rule is
only as good as the list behind it.** Wire it to a maintained feed, version every list
update, and log the list version on each decision — when a jurisdiction is added, this
rule must light up retroactively on review.

**Disposition.** Escalate immediately. Consider countermeasures and filing obligations.

## S-04 · Enhanced-scrutiny jurisdiction concentration
`CALIBRATED` · 46 clients (0.84%)

**Scenario.** Not a single transaction but *sustained* exposure to jurisdictions under
increased monitoring — the pattern of a business routing material value through a weaker
AML regime.

**Logic.** Share of transactions with Tier-2 counterparty countries > **6.67%**
(population p99).

**Caveat.** Tier-2 membership is our own analyst judgement
(`analyst-tier-2026-10-v1-UNVERIFIED`), not a live lookup. Validate against the current
FATF ICRG and EU AMLD Art. 9 lists before this leaves the building.

**Disposition.** Review business rationale for the corridor. Confirm the counterparty
relationship is consistent with the stated business.

---

# B. Value and volume

## S-05 · Single high-value transaction
`CALIBRATED` · 266 clients (4.84%)

**Scenario.** A single transfer sits in the extreme tail of normal activity. Large one-off
movements are how value is placed or extracted in a hurry, and they are the most common
trigger in any real monitoring system.

**Logic.** Any transaction at or above the **99.9th percentile within its own currency**.

**Why native currency, never converted.** Amounts in our data are drawn currency-blind —
every currency has roughly the same native-unit distribution (median 2,667–3,735).
Converting to CZK and thresholding would rank customers by **currency mix, not value**:
EUR alone supplies 2,077 of the 2,304 transactions above CZK 1,000,000. This is the single
most likely silent bug in an AML engine built on this data.

**Disposition.** Confirm source of funds and economic purpose for the specific transfer.

## S-06 · Activity vs declared expectation
`CALIBRATED` · 54 clients (0.98%)

**Scenario.** The customer declared expected turnover at onboarding and is now transacting
far beyond it. The classic "behaviour inconsistent with the customer profile" trigger —
the KYC file no longer describes the customer.

**Logic.** `observed monthly volume / declared monthly volume > 357.8` (population p99).

**Why the threshold looks absurd.** Our declared expectations are not usable: the *median*
client runs 47× their declaration, and a conventional "3× expected" rule fires on **96% of
the book**. The threshold must come from the population, not from intuition. On real data
this should be one of our strongest rules; here it is a percentile detector in a
profile-deviation costume. Recalibrate on day one of live traffic.

**Disposition.** Refresh KYC. Re-document expected activity. Consider whether the original
declaration was deliberately understated.

## S-07 · Self-relative amount outlier
`CALIBRATED` · 54 clients (0.98%)

**Scenario.** A transfer wildly out of character *for this specific customer*, regardless
of absolute size. CZK 200,000 is unremarkable for a corporate and extraordinary for a
pensioner.

**Logic.** Median/MAD robust z of the client's largest transaction against their own
distribution, `z > 371.5` (population p99).

**Why 371 and not 6.** A conventional `z > 6` fires on **100%** of our book: the amount law
is heavy-tailed, so every customer's maximum sits hundreds of MADs above their own median.
Any fixed z threshold is meaningless on amount data. Worth internalising as a team
principle.

**Disposition.** Compare against the customer's stated business model.

## S-08 · Single-day volume spike
`CALIBRATED` · 71 clients (1.29%)

**Scenario.** More than half a customer's monthly value moves on one day. Legitimate
businesses have payroll and settlement days; this is also what a placement event looks
like.

**Logic.** `max single-day volume / monthly volume > 0.50`.

**Disposition.** Identify the event. A single large legitimate payment (property, vehicle,
dividend) usually resolves it; a cluster of unrelated transfers does not.

---

# C. Structuring

## S-09 · Same-counterparty splitting
`CALIBRATED` · 2 clients (0.04%)

**Scenario.** A payment that would cross a reporting threshold is broken into several
smaller legs to the same counterparty on the same day. Textbook structuring.

**Logic.** ≥3 same-day, same-direction transfers to one counterparty.

**Honest note.** Fires on 2 clients because structuring is **absent** from our data — only
1,186 of 396,664 (client, counterparty, day) groups contain more than one leg, and the
maximum group size is 3. Keep the rule; it costs nothing and is a day-one requirement on
real traffic.

**Disposition.** Aggregate the legs and treat as a single transaction for reporting.

## S-10 · Multi-counterparty structuring
`CALIBRATED` · 10 clients (0.18%)

**Scenario.** More sophisticated than S-09: value spread across *many different*
counterparties on the same day, each leg below the reporting tail, defeating any
per-counterparty rule.

**Logic.** Same-day, same-direction legs each below the 99.9th percentile, count above
population p99 (>7 legs).

**Disposition.** Aggregate daily outflow and compare to profile. Check whether the
counterparties are related.

---

# D. Flow patterns

## S-11 · Pass-through account
`CALIBRATED` · 54 clients (0.98%)

**Scenario.** Money in equals money out: the account is a conduit, not a store of value.
Little or nothing is retained. Characteristic of a layering node or a money-mule account.

**Logic.** `min(inflow, outflow) / max(inflow, outflow) > 0.9877` (population p99).

**Disposition.** Establish why the account retains nothing. Legitimate cases exist
(collection accounts, agents) and should be documented, not just closed.

## S-12 · Rapid movement of funds
`CALIBRATED` · 27 clients (0.49%)

**Scenario.** Funds arrive and a matching amount leaves within 24 hours, repeatedly. The
customer is moving someone else's money rather than their own.

**Logic.** Count of in→out pairs matching within 10% inside 24h, **count** above population
p99 (>5).

**Why count and not presence.** A *single* rapid pair is meaningless: 12.12% of inflows
have one, and an amount-shuffled null produces 12.14%. Alerting on presence fired on
**75.7% of the book**. Only an unusual number of such events is evidence. This correction
is the difference between a usable rule and an unusable one.

**Disposition.** Trace the onward beneficiary. Ask what service the customer is providing.

## S-13 · Round-trip with counterparty
`CALIBRATED` · 35 clients (0.64%)

**Scenario.** Value sent to a counterparty comes back in near-equal amount — circular flow
that manufactures transaction history and apparent provenance without economic substance.

**Logic.** Count of counterparties where sent/received symmetry ≥ 0.80, count above
population p99.

**Why count and not presence.** 94.6% of our customers have at least one bidirectional
counterparty, against a null of 95.0%. Presence is not evidence.

**Disposition.** Ask for the commercial rationale. Genuine two-way trading relationships
exist and are documentable.

---

# E. Geography, currency, behaviour

## S-14 · Counterparty-country diversity
`CALIBRATED` · 30 clients (0.55%)

**Scenario.** The customer's counterparty footprint spans far more countries than peers —
unusual geographic reach relative to the stated business.

**Logic.** `distinct counterparty countries > 16` (population p99).

**Disposition.** Compare footprint to the declared business model. A freight forwarder is
expected to be global; a local retailer is not.

## S-15 · Third-currency settlement
`CALIBRATED` · 21 clients (0.38%)

**Scenario.** Repeated settlement in a currency native to neither the payer's nor the
payee's country — classic vehicle-currency usage, which can obscure the real corridor.

**Logic.** Count of third-currency transactions above population p99.

**Note.** In our data 100% of third-currency settlement is USD, which is economically
ordinary. Treat as context, not suspicion.

**Disposition.** Low priority alone. Meaningful in combination.

## S-16 · Off-hours concentration
`CALIBRATED` · 54 clients (0.98%)

**Scenario.** Activity concentrated between 00:00 and 05:59, when legitimate commercial
payments are least likely and manual review is thinnest.

**Logic.** `off-hours share > 14.63%` (population p99).

**Two caveats to carry.** Timestamps are assumed Czech local time — we have no timezone
field, so a foreign customer's "3 a.m." may be their mid-afternoon. And our data has a
flat synthetic clock (82% of volume in a uniform 08–16 block, no weekend or holiday dip
whatsoever — ratios 0.9983 and 0.9973), so this rule is untested in practice.

**Disposition.** Weak alone. Weight only in combination.

## S-17 · Counterparty concentration
`CALIBRATED` · 54 clients (0.98%)

**Scenario.** A single counterparty dominates the customer's value. Economic dependency is
normal; near-total concentration can indicate a conduit arrangement or an undisclosed
related party.

**Logic.** `top counterparty volume share > population p99`.

**Disposition.** Identify the counterparty and the relationship.

## S-18 · New client, immediate scale
`CALIBRATED` · 157 clients (2.86%)

**Scenario.** A customer onboarded within 90 days is already transacting at a level that
takes established customers years to reach. New accounts are the preferred vehicle for
placement precisely because there is no behavioural history to deviate from.

**Logic.** `tenure < 90 days AND monthly volume > population p90`.

**Disposition.** Verify source of funds before the relationship matures. This is the
highest-yield rule in real portfolios and should be prioritised in review.

---

# Operating the ruleset

**Rank by distinct rules fired, not alert count.** Of 962 flagged customers, 827 fire
exactly one rule and only 5 fire five. Genuine risk clusters across independent rules;
noise does not. A customer firing S-02 + S-05 + S-12 deserves attention far more than one
firing S-16 three times.

**Rules do not set risk levels.** They emit evidence. A separate scoring stage applies the
S-01/S-02 floors and combines the rest; a human disposition stage decides. Keep the three
stages separate in code and in the audit log, or "who decided this?" becomes unanswerable.

**Every alert carries its parameters.** The threshold in force at fire time is written into
the alert, so decisions stay reconstructable after policy changes. Changing a threshold
mints a new `ruleset-` version; it never mutates history.

**Blocked by data, not by design.** Mule-account and network detection (no
customer-to-customer edges exist in our data), cross-month trend and recurrence (one month
of history), sanctions and adverse-media screening (no names or ownership data). Revisit
each as the data estate grows.

---

## Related documents

- `out/HOUSE_RULES.md` — eight house rules (C-01 … C-08) covering risk classification,
  the declared-activity covenant, remittance intensity, segment integrity, aggregate
  counterparty exposure, currency expansion, probation and foreign corridors. Those are
  policy-and-action rules with named owners; the 18 above are detection rules.
- `out/ANOMALY_REPORT.md` — the evidence base, including the typologies tested and
  rejected.
- `out/RULESET.md` — evidence tiers and the blocked/disproven register.
