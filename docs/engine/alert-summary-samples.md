# Alert summary samples

Real output of `POST /api/alerts/{id}/summary` on the July 2026 data, taken on 2026-10-19 after re-triaging the latest run with the config at `60c10f1`. Model: `eu.anthropic.claude-sonnet-4-5-20250929-v1:0`, prompt `engine/src/main/resources/prompts/alert-summary.md`. Use it to judge the prompt and to design where the summary goes in the UI; nothing in the frontend shows it yet.

One alert per type and disposition, highest score first. Six of seven passed the checks; one was rejected.

## 5570 · B · ESCALATE 90 (TX000297307)

> Rule B2 fired on transaction TX000297307 because the client is a PEP and the outgoing or unknown-direction transaction amount of CZK 2,041,089.90 exceeded the threshold of CZK 100,000. The engine triaged this alert as ESCALATE with a score of 90, based on 35 points for the base score for B2, 20 points for the client's high AML rating, 15 points for the largest amount of CZK 2,041,089.90, 10 points for the client relationship length of 72 days, and 10 points for also being flagged by type A.

## 5687 · C · ESCALATE 100 (TX000028836)

> Rule C1 triggered on transaction TX000028836 because the inflow of CZK 210,424.68 from payers AAT00160 and ACZ00044 exceeded the minimum threshold of CZK 100,000.00, and the outflow of CZK 193,962.85 was at least 80% of the inflow (the forward percentage threshold). The triage engine assigned a disposition of ESCALATE with a score of 100, based on the rule base score of 45 points, the client's high AML rating contributing 20 points, the client being a PEP adding 15 points, the transaction amount of CZK 206,749.66 adding 3 points, and the client also being flagged by alert types A and B contributing 20 points. The raw score of 103 was clamped to 100 to fit within the allowed range.

## 5619 · C · REVIEW_HIGH 83 (TX000004708)

> Rule C1 fired on transaction TX000004708 because the inflow of CZK 113,764.51 from payer ASK00057 exceeded the minimum threshold of CZK 100,000 and the outflow of CZK 118,370.13 was at least 80 percent of the inflow. The triage assigned a disposition of REVIEW_HIGH with a score of 83 points, based on the rule base score of 45 points, the client's high AML rating contributing 20 points, the largest amount of CZK 113,764.51 adding 3 points, the client relationship length of 196 days adding 5 points, and the client being flagged by rule A adding 10 points.

## 5508 · B · REVIEW_HIGH 83 (TX000044857)

> Rule B2 fired on transaction TX000044857 because the client is a PEP and the outgoing or unknown-direction transaction amount of CZK 427,981.24 exceeded the threshold of CZK 100,000. The engine triaged this alert as REVIEW_HIGH with a score of 83, based on the base score for B2 (35 points), the client's high AML rating (20 points), the transaction amount of CZK 427,981.24 (8 points), and the fact that the client was also flagged by rules A and C (20 points).

## 30 · A · REVIEW_LOW 43 (client K000030)

> The alert was triggered by three rules on client K000030: rule A1 fired 12 times when daily volume between CZK 344,343.68 and CZK 1,915,338.95 exceeded 25 percent of expected monthly volume; rule A2 fired 14 times when daily volume between CZK 169,567.31 and CZK 1,915,338.95 exceeded 3 times the Q2 daily average; and rule A3 fired 14 times on transactions TX000056601, TX000081004, TX000093877, TX000109652, TX000152853, TX000158758, TX000165463, TX000197294, TX000203009, TX000246440, TX000256732, TX000272277, TX000344278, and TX000360754 where amounts between CZK 317,618.96 and CZK 980,254.86 exceeded 2 times the Q2 maximum transaction. The triage assigned a REVIEW_LOW disposition with a score of 43 points, based on 12 points for the base score of rules A1, A2, and A3, 6 points for 3 distinct rules firing, 15 points for the largest amount of CZK 1,915,338.95, and 10 points for the client also being flagged by alert type C.

## 317 · A · AUTO_CLOSE 23 (client K000317)

> The alert fired on client K000317 because rule A1 detected daily volumes between CZK 32,587.72 and CZK 45,403.88 exceeding 25% of expected monthly volume on 5 days, rule A2 found daily volumes between CZK 15,723.23 and CZK 45,403.88 exceeding 3 times the Q2 average on 7 days, and rule A3 identified 5 transactions with amounts between CZK 29,023.37 and CZK 42,721.95 exceeding 2 times the Q2 maximum transaction. The triage engine assigned an AUTO_CLOSE disposition with a score of 23 points, comprising 12 points for the base score of rules A1, A2, A3, 6 points because 3 distinct rules fired on one alert, and 5 points because the client was onboarded via distant form.

## 5384 · A · ESCALATE 93: rejected (502)

```
sentence 0 has numbers not in the input: [10,622, 2,041,090, 5,399, 2,041,090, 93,939, 2,041,090]
```

The model rounded amounts (2,041,089.90 to 2,041,090) and the number check refused the summary. That is the check working, but at one in seven the UI needs a retry or an error state.

## Observations

- The second sentence restates the triage score and every point it is made of. Once the score and its reasons sit somewhere central in the UI, the summary duplicates them; the prompt could keep to the activity.
- Type A summaries get long. Alert 30 names 14 transaction ids in one sentence. Capping the ids the summary names, or leaving the list to the UI, would help.
- In 5687, "the transaction amount of CZK 206,749.66" passed the number check because the number is in the input, but it is the largest amount, not this transaction's. The check cannot catch a real number with the wrong label.
- Every sentence carries `refs` (`rule:B2`, `triage:…`), so the UI can link a sentence to the card it rests on.
- "onboarded via distant form" is the wording of the client data field.
