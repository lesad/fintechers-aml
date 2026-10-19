# Writing Jev questions

Jev (TypeSafe's System One model) answers a typed question about a piece of state with a probability. It writes no text. In this app it makes the judgement calls the rules can't settle; code owns everything else. Read on 2026-10-19 from the live TypeSafe docs; links at the end.

## The three primitives

| Need                       | Primitive | Answer                                                                               | Our uses                                       |
| -------------------------- | --------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Does a condition hold?     | `noul`    | `noul`: probability of yes, 0 to 1. No `confidence`                                  | A `profile_consistent`, C `business_rationale` |
| One of a defined set       | `choice`  | `choice`, `probabilities` per option (sum to 1), `confidence`                        | C `typology`                                   |
| A degree on ordered levels | `score`   | `score` (may fall between levels), `legend`, `probabilities` per level, `confidence` | A `anomaly_severity`                           |

Several labels that can all apply are several Nouls, not one Choice.

## Request and response

```json
{
  "model": "jev-1.13.0",
  "state": { "client": {}, "alert": {} },
  "questions": {
    "profile_consistent": {
      "type": "noul",
      "instructions": "...",
      "criteria": { "true": "...", "false": "..." }
    }
  }
}
```

The response carries `model` (the exact version that answered), `answers` keyed by question id, and `usage` (input and output tokens). `POST https://api.typesafe.ai/v1/systemone`; the key stays server-side.

All questions about one alert go in one request. They run in parallel and can't see each other's answers, so latency barely changes. A second request is only needed when an answer decides what to ask next.

## Rules for a good question

1. **One narrow judgement per question.** If two analysts could agree on one half and argue about the other, split it.
2. **Code computes, Jev judges.** Jev 1.13 is not a calculator: arithmetic, counting, date order and window checks are unreliable. Send ratios, counts and hours as named facts, and add a band computed in code (`czk_spike_band: "extreme"`) next to any number Jev must weigh.
3. **Named JSON state, only what matters.** Accuracy drops as `state` fills with irrelevant content. Never send raw transaction lists; send the facts. Refer to fields by backticked path in the instructions (`alert.forward_share`).
4. **The question id is for code only.** It is not sent to the model, so the instructions carry the full meaning.
5. **Concrete criteria.** Each option or level describes a situation that stands on its own. No double negatives, no options that contradict the instructions.
6. **A way out.** A Choice gets an `other` option when nothing may fit.
7. **Fixed option order.** Jev favours the first option of a Choice. Keep the order fixed, log it, and test once with the order reversed.
8. **Literal wording.** Jev answers what the question says, not what we meant. Scoping words and negations are taken at face value.
9. **English.** It gives the best accuracy.
10. **State is data, not instructions.** Adversarial text in `state` can steer answers. Our state is computed facts plus enum values from the client file, which keeps that risk low.

## Using the answers

TypeSafe's confidence guidance, applied to our policy:

- Choice and Score `confidence` is how concentrated the distribution is: 1 is all on one option, 0 an even spread. It is not "the probability the workflow is right".
- A Noul has no `confidence`. A value near 0.5 means yes and no are about equally likely, not "medium". Distance from 0.5 is the uncertainty.
- High confidence: act. Medium: act with a flag or ask a person. Low: don't act; route to a human.
- Thresholds scale with the stakes. Closing an alert as FP is the destructive action here, so it gets the highest bar.
- Score magnitudes are weakly calibrated in 1.13: threshold them, never read 1.6 as "60% of the way".
- Calibration is TypeSafe's claim. Ours is measured on the held-out labels.

Every threshold is a parameter in the rule's spec with status `default` until the labels tune it.

## What Jev gives us for the audit trail

| Jev returns                                       | Jev does not return                                              |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| The exact model version (`jev-1.13.0`)            | A rationale: the "why" is our criterion text plus the facts sent |
| The answer with its full probability distribution | A request id (none documented)                                   |
| `confidence` for Choice and Score                 | Determinism: no seed documented; a replay may differ             |
| Token usage                                       | Hosting region or data retention (not documented)                |

So we build the record. Every call logs:

- the full `state` and `questions` sent, and a SHA-256 of both
- the model we pinned and the `model` that answered
- every answer with all its probabilities and confidence
- the policy version and the thresholds applied
- the resulting triage, and who confirmed it and when

That covers who, when, on what inputs, with what result and why (Decree §18(3)). The reasoning is in the written criterion, not in free text, so the decision can be read without trusting a model's prose.

## Versions and fallback

- `jev-latest` is 1.13.0; `jev-preview` is 1.14.0 (from 14 October). Pin `jev-1.13.0` for the whole run: answers can change between releases.
- If Jev access fails, Claude Sonnet 4.5 with a forced tool call answers the same questions in the same request and answer shape. Its probabilities are not calibrated, so the policy treats it as lower confidence.

## Sources

- How to build with System One: https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md
- HTTP API: https://docs.typesafe.ai/api.md
- Primitives: https://docs.typesafe.ai/primitives/noul.md, https://docs.typesafe.ai/primitives/choice.md, https://docs.typesafe.ai/primitives/score.md
- Confidence: https://docs.typesafe.ai/confidence.md
- Jev 1.13 known limitations: https://docs.typesafe.ai/model-jaggedness/jev-1.13.md
- Composite scoring: https://docs.typesafe.ai/patterns/composite-scoring.md
- Citation check (for checking the Sonnet case story): https://docs.typesafe.ai/cookbooks/citation_check.md
- Our split between code, Jev and the LLM: [decision-architecture.md](../challenge/decision-architecture.md)
