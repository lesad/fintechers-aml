# Rules: the second layer, per alert type

This folder specifies what happens to an alert after the engine raises it: guardrails, triage, priority, route, reason and log, plus the interpretation decisions the engine's seed rules follow. It is organised by **alert type** (A, B, C), not by rule, because rules are configured at runtime (ADR-0032).

Detection itself (rules, CEL conditions, variables, parameters, layers, versions, runs, hits, evidence) is the engine's: [`docs/engine/rules-engine-design.md`](../engine/rules-engine-design.md) and the migrations in `engine/src/main/resources/db/migrations/`. This folder cites the engine and never restates a condition or a parameter value. Terms: [GLOSSARY.md](../GLOSSARY.md).

## Files

| File                                                            | What                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [TEMPLATE.md](TEMPLATE.md)                                      | The shape of an alert-type spec                                          |
| [A-profile-discrepancy.md](A-profile-discrepancy.md)            | Alert type A: activity out of line with the client's profile             |
| [B-high-risk-pep.md](B-high-risk-pep.md)                        | Alert type B: high-risk country or PEP                                   |
| [C-flow-through.md](C-flow-through.md)                          | Alert type C: money in and out again within hours                        |
| [priority.md](priority.md)                                      | The 0 to 100 priority scorecard shared by every alert type               |
| [escalation.md](escalation.md)                                  | Who decides and who approves, with the conflict-of-interest checks       |
| [candidates.md](candidates.md)                                  | Rules we could add under A, B or C, with the data verdict and a CEL sketch |
| [data-patterns.md](../challenge/data-patterns.md)               | Data run: the generator fingerprint and the verdict on every signal tried |
| [aml-pattern-research.md](../challenge/aml-pattern-research.md) | The pattern research behind the data run and the candidates              |

## Two layers, and AI outside both

| #   | Step     | Owner        | Output                                                                  |
| --- | -------- | ------------ | ----------------------------------------------------------------------- |
| 1   | Detect   | engine       | hits with evidence (`rule_hit`), grouped into alerts per alert unit     |
| 2   | Guard    | second layer | guardrails: triage gates, priority floors and caps, approver rules      |
| 3   | Triage   | second layer | `FP` or `REVIEW` from the guardrails and the triage policy              |
| 4   | Priority | second layer | 0 to 100 from [priority.md](priority.md), with its breakdown            |
| 5   | Route    | second layer | executive role, person and approver from [escalation.md](escalation.md) |
| 6   | Record   | second layer | `reason` from the template, an `audit_entry` per step                   |

Every step is code. AI comes after: it writes the reviewer's summary from `llm_context` and the log, and drafts rule proposals for the engine. A proposal goes through the engine's checks and a person's approval, like any rule version.

## Rules are configured, and so is triage policy

A rule can be added, replaced or suppressed at runtime under any alert type. Triage's **logic** must never test a rule key ("if A3 fired") — no branch in the code names one. Its **data** does: a rule key's base score, whether it may auto-close and whether it implies a PEP are per-key rows in `triage_rule`, keyed to a version of the triage config (ADR-0048). That is not resolved, it is moved: the scores are still keyed by rule key, but they are versioned configuration a reviewer edits through `/api/triage`, not values compiled into the decision. A rule with no row is not a crash and not a hidden default — it scores `unknownRuleScore` and the `UNKNOWN_RULE` floor keeps the alert in review until someone scores it, and `GET /api/triage/coverage` lists the rules waiting for that.

So the logic reads:

- the alert type and its alert unit;
- the hits: how many, and how many distinct rules;
- the **evidence contract** of the alert type: the fields every rule of that type puts in its evidence;
- the client's fields;
- the active triage config: the policy's scalars and bands, and the scored keys, all as data in its own tables.

A new rule only has to meet its type's evidence contract to be triaged safely, and a `triage_rule` row to be triaged at its true weight. Each alert-type spec lists its contract and what `llm_context` must add.

## How to change something

- **A threshold or a rule:** in the engine, as a new rule version or parameter override, through its checks and approval. Note the change and its counts in the alert type's change log here.
- **An interpretation** (prorating, a window's start, what counts as outflow): here first, then in the engine's seed rules.
- **A triage weight, band, floor or a rule's base score:** a new triage config version through `/api/triage` (insert-only, `draft → active`); it applies to the next run, and nothing re-triages what is already decided.
- **Triage, priority, route, reason:** here, then in the second-layer code.
- **A mentor answer:** write it in [mentor-questions.md](../challenge/mentor-questions.md) and in the spec it settles.

An alert type is done when its guardrails and triage policy are code, its test cases pass, and its numbers on the labelled set are in its change log. Labelling plan: [decision-architecture.md](../challenge/decision-architecture.md#labelling-plan).

## Status

| Alert type | Seed rules      | Engine run           | Triage policy | Tests             |
| ---------- | --------------- | -------------------- | ------------- | ----------------- |
| A          | `A1` `A2` `A3`  | 5,493 alerts         | draft         | detection only    |
| B          | `B1` `B2`       | 112 alerts, 22 clients | always REVIEW | detection only  |
| C          | `C1` (v2)       | 1,077 alerts         | always REVIEW | detection only    |
| Priority   | n/a             | n/a                  | draft         | none              |
| Routing    | n/a             | n/a                  | default       | none              |
