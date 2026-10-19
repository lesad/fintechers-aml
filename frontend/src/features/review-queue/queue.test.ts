import { describe, expect, it } from "vitest";

import { MOCK_QUEUE } from "./mock";
import { filterQueue, formatAge, NO_FILTER, openCountByRating } from "./queue";

describe("filterQueue", () => {
  it("sorts by rule rating, then oldest first", () => {
    const rows = filterQueue(MOCK_QUEUE, NO_FILTER);

    expect(rows.map((r) => r.rule)).toEqual([
      ...Array(4).fill("High"),
      ...Array(4).fill("Medium"),
      ...Array(4).fill("Low"),
    ]);
    expect(rows[0]?.id).toBe("TX000004790");
  });

  it("filters by rating, open status and a case-insensitive id or client query", () => {
    expect(filterQueue(MOCK_QUEUE, { ...NO_FILTER, rating: "Low" })).toHaveLength(4);
    expect(
      filterQueue(MOCK_QUEUE, { ...NO_FILTER, status: "open" }).every((r) => r.status !== "Closed"),
    ).toBe(true);
    expect(filterQueue(MOCK_QUEUE, { ...NO_FILTER, query: " k003797 " }).map((r) => r.id)).toEqual([
      "TX000004812",
      "TX000123456",
      "TX000004822",
    ]);
  });
});

describe("openCountByRating", () => {
  it("leaves closed cases out", () => {
    expect(openCountByRating(MOCK_QUEUE)).toEqual({ High: 4, Medium: 4, Low: 3 });
  });
});

describe("formatAge", () => {
  const now = new Date("2026-10-19T14:30");
  it.each([
    ["2026-10-19T14:18", "12 min"],
    ["2026-10-19T09:27", "5h 3m"],
    ["2026-10-17T10:30", "2d 4h"],
  ])("%s → %s", (flagged, age) => {
    expect(formatAge(new Date(flagged), now)).toBe(age);
  });
});
