import { describe, expect, it } from "vitest";

import { byStatus, formatAge, formatTs, toQueueItem } from "./queue";

import type { FlaggedTransaction } from "./api";

const flagged: FlaggedTransaction = {
  id: "TX000123456",
  clientId: "K003797",
  ts: "2026-07-17T15:58:12",
  amountHalere: 18_450_000,
  volume: 7352,
  currency: "EUR",
  direction: "out",
  alertTypes: ["B"],
  rules: [{ key: "B2", name: "PEP outgoing payment above the limit" }],
  rating: "High",
  disposition: "ESCALATE",
  score: 92,
  flaggedAt: "2026-10-19T18:25:35Z",
};

describe("toQueueItem", () => {
  it("turns an engine row into a queue row in CZK, unrated by AI, new", () => {
    expect(toQueueItem(flagged)).toMatchObject({
      id: "TX000123456",
      client: "K003797",
      rule: "High",
      ruleReason: "PEP outgoing payment above the limit",
      ai: "none",
      amount: 184_500,
      date: "2026-07-17 15:58",
      status: "New",
      disposition: "ESCALATE",
      score: 92,
    });
  });
});

describe("byStatus", () => {
  const items = [
    { ...toQueueItem(flagged), id: "a" },
    { ...toQueueItem(flagged), id: "b", status: "Closed" as const },
    { ...toQueueItem(flagged), id: "c", status: "Escalated" as const },
  ];

  it("keeps open cases, or one status, or all", () => {
    expect(byStatus(items, "open").map((r) => r.id)).toEqual(["a", "c"]);
    expect(byStatus(items, "Closed").map((r) => r.id)).toEqual(["b"]);
    expect(byStatus(items, "all")).toHaveLength(3);
  });
});

describe("formatting", () => {
  const now = new Date("2026-10-19T14:30");
  it.each([
    ["2026-10-19T14:18", "12 min"],
    ["2026-10-19T09:27", "5h 3m"],
    ["2026-10-17T10:30", "2d 4h"],
  ])("age since %s is %s", (flaggedAt, age) => {
    expect(formatAge(new Date(flaggedAt), now)).toBe(age);
  });

  it("shows a timestamp to the minute", () => {
    expect(formatTs("2026-07-01T00:15:25")).toBe("2026-07-01 00:15");
  });
});
