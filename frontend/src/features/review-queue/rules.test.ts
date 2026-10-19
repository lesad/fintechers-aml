import { describe, expect, it } from "vitest";

import { ruleThresholds, rulesSummary } from "./rules";

import type { Hit } from "./api";

const hit = (rule: string, evidence: Hit["evidence"]): Hit => ({
  rule,
  name: `Rule ${rule}`,
  version: 1,
  grainKey: "x",
  evidence,
});

describe("ruleThresholds", () => {
  it("takes each rule's parameters from its first hit, verbatim", () => {
    expect(
      ruleThresholds([
        hit("C1", { inflow: 27_776_629, "p.min_inflow": 10_000_000, "p.forward_pct": 80 }),
        hit("C1", { "p.forward_pct": 99 }),
        hit("B2", { "tx.amount": 18_450_000, "p.pep_min": 10_000_000 }),
      ]),
    ).toEqual([
      {
        rule: "C1",
        params: [
          ["p.min_inflow", "10000000"],
          ["p.forward_pct", "80"],
        ],
      },
      { rule: "B2", params: [["p.pep_min", "10000000"]] },
    ]);
  });
});

describe("rulesSummary", () => {
  it("names the first rule and counts the rest", () => {
    expect(rulesSummary(["PEP outgoing payment above the limit"])).toBe(
      "PEP outgoing payment above the limit",
    );
    expect(rulesSummary(["Daily volume", "Q2 average"])).toMatch(/\(\+1 more\)$/);
  });
});
