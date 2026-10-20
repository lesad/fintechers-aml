import { describe, expect, it } from "vitest";

import { csDateTime, czk, durationMs, evidenceLines, flowOf, hitSpan, splitHits } from "./opo";

import type { Hit, HistoryTransaction, OpoRule } from "./api";

const tx = (
  id: string,
  ts: string,
  direction: HistoryTransaction["direction"],
  amount: number,
) => ({
  id,
  ts,
  direction,
  counterpartyAccount: `ACC-${id}`,
  counterpartyCountry: "CZ",
  amount,
  alertTypes: [],
});

// TX000012335 and its client's days, as the engine holds them.
const reported = tx("R", "2026-07-01T19:42:53", "in", 197_918.56);
const txs: HistoryTransaction[] = [
  tx("BEFORE", "2026-07-01T09:00:00", "out", 1),
  tx("OUT1", "2026-07-01T13:45:05", "out", 395_189.4),
  reported,
  tx("ANCHOR", "2026-07-02T10:13:26", "in", 4_937.73),
  tx("REMIT", "2026-07-02T15:03:05", "unknown", 710_505.57),
  tx("AFTER", "2026-07-03T05:42:19", "out", 53_460.74),
];

const c1: OpoRule = {
  key: "C1",
  version: 4,
  name: "Flow-through: inflow forwarded within hours",
  grain: "client_anchor",
  condition: "inflow > p.min_inflow && outflow * 100.0 >= p.forward_pct * inflow",
  variables: [
    {
      name: "inflow",
      agg: "sum",
      field: "amount",
      window: { kind: "relative", from: "PT-24H", to: "PT0S" },
    },
    {
      name: "payers",
      agg: "set",
      field: "payer_account",
      window: { kind: "relative", from: "PT-24H", to: "PT0S" },
    },
    {
      name: "outflow",
      agg: "sum",
      field: "amount",
      window: { kind: "relative", from: "PT0S", to: "PT6H" },
    },
  ],
  params: {
    min_inflow: { value: 100_000, unit: "amount" },
    forward_pct: { value: 80, unit: "percent" },
  },
};
const a1: OpoRule = {
  key: "A1",
  version: 1,
  name: "Day volume",
  grain: "client_day",
  condition: "day_volume > p.cap",
  variables: [{ name: "day_volume", agg: "sum", field: "amount", window: { kind: "day" } }],
  params: { cap: { value: 1, unit: "amount" } },
};

const hit = (
  rule: string,
  version: number,
  grainKey: string,
  evidence: Hit["evidence"] = {},
): Hit => ({
  rule,
  name: rule,
  version,
  grainKey,
  evidence,
});

const nbsp = (s: string) => s.replaceAll(/\s/g, " ");

describe("durationMs", () => {
  it("reads the engine's ISO durations, negative ones too", () => {
    expect(durationMs("PT-24H")).toBe(-24 * 3_600_000);
    expect(durationMs("PT6H")).toBe(6 * 3_600_000);
    expect(durationMs("PT0S")).toBe(0);
    expect(durationMs("-PT30M")).toBe(-30 * 60_000);
    expect(durationMs("P1D")).toBe(24 * 3_600_000);
  });
});

describe("hitSpan and splitHits", () => {
  it("counts a flow-through hit as grounds when its window, anchored on another transaction, holds the reported one", () => {
    const grounds = hit("C1", 4, "ANCHOR");
    const elsewhere = hit("C1", 4, "NOT-IN-HISTORY");
    const split = splitHits([grounds, elsewhere], { rules: [c1], txs, reported });
    expect(split.grounds.map((f) => f.hit)).toEqual([grounds]);
    expect(split.other.map((f) => f.hit)).toEqual([elsewhere]);
  });

  it("lists the client's transactions from 24 h before the anchor to 6 h after it, oldest first", () => {
    const span = hitSpan(hit("C1", 4, "ANCHOR"), c1, txs);
    expect(flowOf([span!], txs).map((t) => t.id)).toEqual(["OUT1", "R", "ANCHOR", "REMIT"]);
  });

  it("takes a client-day hit's span from its date key", () => {
    const sameDay = hit("A1", 1, "2026-07-01");
    const nextDay = hit("A1", 1, "2026-07-02");
    const split = splitHits([sameDay, nextDay], { rules: [a1], txs, reported });
    expect(split.grounds.map((f) => f.hit)).toEqual([sameDay]);
  });

  it("keeps a hit on the reported transaction itself even without its rule version", () => {
    const own = hit("B2", 9, "R");
    expect(splitHits([own], { rules: [], txs, reported }).grounds.map((f) => f.hit)).toEqual([own]);
  });
});

describe("evidenceLines", () => {
  it("says what each value measures, over which window, with amounts in CZK", () => {
    const lines = evidenceLines(
      hit("C1", 4, "ANCHOR", {
        inflow: 202_856.29,
        payers: ["ACZ00069", "ASK00012"],
        outflow: 812_837.49,
        "tx.amount": 4_937.73,
        "p.min_inflow": 100_000,
        "p.forward_pct": 80,
      }),
      c1,
    ).map(([label, value]) => `${label}: ${nbsp(value)}`);
    expect(lines).toEqual([
      "inflow: součet částek v okně od 24 h před obchodem ANCHOR do okamžiku obchodu ANCHOR: 202 856,29 CZK",
      "payers: seznam účtů plátců v okně od 24 h před obchodem ANCHOR do okamžiku obchodu ANCHOR: ACZ00069, ASK00012",
      "outflow: součet částek v okně od okamžiku obchodu ANCHOR do 6 h po obchodu ANCHOR: 812 837,49 CZK",
      "částka obchodu ANCHOR: 4 937,73 CZK",
      "práh min_inflow: 100 000,00 CZK",
      "práh forward_pct: 80 %",
    ]);
  });
});

describe("formats", () => {
  it("writes Czech amounts and dates", () => {
    expect(nbsp(czk(197_918.56))).toBe("197 918,56 CZK");
    expect(csDateTime("2026-07-01T19:42:53")).toBe("1. 7. 2026 19:42");
  });
});
