# Escalation: who decides, who approves

**Status:** decided by the team on 2026-10-19 (mentor question 1): at least two people per alert, configurable per role; the approver is AML staff or higher, and a board member or the AML delegate for a PEP. The matrix below is our default. Routing is a lookup in code.

## Roles

Configurable, because AMLR (from 10 July 2027) maps them one to one: the board AML member becomes the compliance manager, and the contact person's filing role moves to the compliance officer.

| Role id              | Czech term                          | Does                                         | Basis               |
| -------------------- | ----------------------------------- | -------------------------------------------- | ------------------- |
| `l1_analyst`         |                                     | First look, prepares the case                | ours                |
| `l2_analyst`         |                                     | Investigates, confirms or excludes suspicion | ours                |
| `compliance_officer` | kontrolor dodržování předpisů (AML) | Second line; approves high-risk cases        | Decree §16(2)       |
| `contact_person`     | kontaktní osoba                     | Files the OPO with FAÚ                       | Act §22             |
| `board_aml_member`   | pověřený člen statutárního orgánu   | Consents to continuing a PEP relationship    | Act §22a, §9a(3)(d) |

The data links no client to a staff member, so `executive_person` and `approver` are placeholder people per role (`l2_analyst_01`, `compliance_officer_01`). `approver` is a person (an entity) on every row, FP rows included (team, 2026-10-19).

## Matrix

| Alert                         | Executive (`executive_role`) | Approver (4 eyes)                                                                    | FAÚ trigger                                                               |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| A, FP                         | `l1_analyst` (QA sample)     | a second `l1_analyst`, outside the client's business line                            | none                                                                      |
| A, REVIEW                     | `l2_analyst`                 | a second analyst, outside the client's business line                                 | L2 confirms suspicion, then `contact_person` files                        |
| B                             | `l2_analyst`                 | `compliance_officer`; plus `board_aml_member` when a PEP relationship is to continue | suspicion, or source of funds not explained                               |
| C                             | `l2_analyst`                 | `contact_person` and `compliance_officer`                                            | OPO by default unless the purpose is documented; 24 h hold possible (§20) |
| C, reviewer finds no purpose  | `contact_person`             | `compliance_officer`                                                                 | as above, flagged urgent                                                  |

Source: [czech-aml-escalation.md](../challenge/czech-aml-escalation.md) section 6, our recommendation, not a matrix from law.

Candidates D to G ([candidates.md](candidates.md)) are rules under A or B, so the row of their alert type routes them. One exception to keep: a review that changes the client's rating or CDD intensity (candidate D) needs the `compliance_officer` as approver (AMLR Art. 76(5)(b)).

## Conflict-of-interest checks (code)

A row is invalid, and the run fails, when any of these holds:

- The approver is the executive person.
- The approver has a relationship-manager link to the client (no such data yet; the check is in place for when it exists).
- The `contact_person` concludes or settles trades or works in internal audit (Act §22(5)).
- The approver works in the front office or internal audit.

The rule that an analyst must not review their own client is not in any Czech or EU source we found. It is our policy under the four-eyes principle (team, 2026-10-19), not a question for ČNB.

## SLA

The bank sets the deadline (Decree §17a). ČNB expects days for daily scenarios, counted from alert generation. An OPO goes "without undue delay", which FAÚ reads as under 5 calendar days. Our timers: REVIEW within 3 working days, high band within 1 (defaults).

## Open questions

None. The matrix and conflict rules (1), `approver` as a person on every row, and the own-client rule are decided by the team ([mentor-questions.md](../challenge/mentor-questions.md), 2026-10-19).
