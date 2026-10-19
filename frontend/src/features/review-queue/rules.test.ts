import { describe, expect, it } from "vitest";

import { ruleFacts, rulesSummary, strongestFacts } from "./rules";

import type { DetailClient, Hit } from "./api";

const client: DetailClient = {
  id: "K1",
  country: "CZ",
  contractDate: "2019-03-14",
  channel: "in person",
  pep: true,
  type: "legal entity",
  risk: "high",
  expectedMonthlyHalere: 40_000_000,
  expectedCount: 55,
  q2VolumeHalere: 162_000_000,
  q2TxCount: 182,
  q2MaxTxHalere: 6_140_000,
  q2Days: 90,
};

const hit = (rule: string, evidence: Hit["evidence"]): Hit => ({
  rule,
  version: 1,
  grainKey: "x",
  evidence,
});

describe("ruleFacts", () => {
  it("states B2 as limit vs amount", () => {
    expect(
      ruleFacts(hit("B2", { "tx.amount": 18_450_000, "p.pep_min": 10_000_000 }), client),
    ).toMatchObject({
      threshold: "100,000 CZK",
      actual: "184,500 CZK",
      ratio: 1.845,
    });
  });

  it("derives A1 and A2 thresholds from the client's profile", () => {
    const a1 = ruleFacts(hit("A1", { day_volume: 56_000_000, "p.projected_pct": 25 }), client);
    expect(a1.threshold).toBe("25 % of monthly · 100,000 CZK");
    const a2 = ruleFacts(hit("A2", { day_volume: 56_000_000, "p.avg_multiple": 3 }), client);
    expect(a2.threshold).toBe("3× Q2 daily avg · 54,000 CZK");
  });

  it("states C1 as the forwarded share", () => {
    const c1 = ruleFacts(
      hit("C1", { inflow: 35_771_223, outflow: 28_648_086, "p.forward_pct": 80 }),
      client,
    );
    expect(c1).toMatchObject({ threshold: "≥ 80 % forwarded", actual: "80 % forwarded" });
  });

  it("picks the hit furthest over its threshold", () => {
    const top = strongestFacts(
      [
        hit("A1", { day_volume: 11_000_000, "p.projected_pct": 25 }),
        hit("A1", { day_volume: 30_000_000, "p.projected_pct": 25 }),
      ],
      client,
    );
    expect(top?.actual).toBe("300,000 CZK");
  });
});

describe("rulesSummary", () => {
  it("names the first rule and counts the rest", () => {
    expect(rulesSummary(["B2"])).toBe("PEP outgoing payment above the limit");
    expect(rulesSummary(["A1", "A2"])).toMatch(/\(\+1 more\)$/);
  });
});
