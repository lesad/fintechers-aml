import { describe, expect, it } from "vitest";

import { formatAge, formatTs, toAssess, toQueueItem } from "./queue";

import type { FlaggedTransaction } from "./api";

const flagged: FlaggedTransaction = {
  id: "TX000123456",
  clientId: "K003797",
  ts: "2026-07-17T15:58:12",
  amount: 184_500,
  volume: 7352,
  currency: "EUR",
  direction: "out",
  alertTypes: ["B"],
  rules: [{ key: "B2", name: "PEP outgoing payment above the limit" }],
  rating: "High",
  aiRating: null,
  disposition: "ESCALATE",
  score: 92,
  status: "ESCALATED",
  flaggedAt: "2026-10-19T18:25:35Z",
};

describe("toQueueItem", () => {
  it("turns an engine row into a queue row in CZK, unrated by AI, with its status", () => {
    expect(toQueueItem(flagged)).toMatchObject({
      id: "TX000123456",
      client: "K003797",
      rule: "High",
      ruleReason: "PEP outgoing payment above the limit",
      ai: "none",
      amount: 184_500,
      date: "2026-07-17 15:58",
      status: "Escalated",
      disposition: "ESCALATE",
      score: 92,
    });
  });

  it("maps the row's AI rating", () => {
    expect(toQueueItem({ ...flagged, aiRating: "Low" }).ai).toEqual({ rating: "Low" });
    expect(toQueueItem({ ...flagged, aiRating: null }).ai).toBe("none");
  });
});

describe("formatting", () => {
  const now = new Date("2026-10-19T14:30");
  it.each([
    ["2026-10-19T14:18", "12 min"],
    ["2026-10-19T09:27", "5h 3m"],
    ["2026-10-17T10:30", "2d 4h"],
    // Flagged after the clock was last read: just in, never negative.
    ["2026-10-19T14:32", "0 min"],
  ])("age since %s is %s", (flaggedAt, age) => {
    expect(formatAge(new Date(flaggedAt), now)).toBe(age);
  });

  it("shows a timestamp to the minute", () => {
    expect(formatTs("2026-07-01T00:15:25")).toBe("2026-07-01 00:15");
  });
});

describe("toAssess", () => {
  const row = toQueueItem(flagged);

  it("takes the first five open cases without an AI rating", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ ...row, id: `TX${i}` }));
    expect(toAssess(rows).map((r) => r.id)).toEqual(["TX0", "TX1", "TX2", "TX3", "TX4"]);
  });

  it("does not reach past the first five open cases when some of them already have an AI rating", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      ...row,
      id: `TX${i}`,
      ai: i < 2 ? { rating: "Low" as const } : row.ai,
    }));
    expect(toAssess(rows).map((r) => r.id)).toEqual(["TX2", "TX3", "TX4"]);
  });

  it("skips closed cases and cases that already have an AI rating", () => {
    const rows = [
      { ...row, id: "fp", status: "False Positive" as const },
      { ...row, id: "reported", status: "Reported" as const },
      { ...row, id: "rated", ai: { rating: "Low" as const } },
      { ...row, id: "new", status: "New" as const },
    ];
    expect(toAssess(rows).map((r) => r.id)).toEqual(["new"]);
  });
});
