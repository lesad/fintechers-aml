import { describe, expect, it } from "vitest";

import { historyOf, noteOf, scoreChanges, stamp } from "../history";
import { as, CONFIG, proposed } from "./fixtures";

describe("stamp", () => {
  it("reads an ISO timestamp as the date and minute the design shows", () => {
    expect(stamp("2026-10-20T09:00:00+02:00")).toMatch(/^2026-10-20 \d\d:00$/);
  });

  it("leaves something it cannot read alone, rather than printing Invalid Date", () => {
    expect(stamp("not a date")).toBe("not a date");
  });
});

describe("scoreChanges", () => {
  it("names only the scores that moved, in key order", () => {
    expect(scoreChanges(CONFIG, proposed({ B2: 50, A1: 30 }))).toEqual([
      { ruleKey: "A1", from: 8, to: 30 },
      { ruleKey: "B2", from: 35, to: 50 },
    ]);
  });

  it("reads a score the earlier version does not have as not set", () => {
    expect(scoreChanges(CONFIG, proposed({ A3: 20 }))).toEqual([
      { ruleKey: "A3", from: null, to: 20 },
    ]);
  });

  it("finds nothing when a version moved no score", () => {
    expect(scoreChanges(CONFIG, as(CONFIG, { version: 2 }))).toEqual([]);
  });
});

describe("noteOf", () => {
  it("says how much policy the first version carried", () => {
    expect(noteOf(CONFIG, undefined)).toBe("First version · 2 rules scored");
  });

  it("names what a version changed against the one before it", () => {
    expect(noteOf(proposed({ A1: 30 }), CONFIG)).toBe("A1 8 → 30");
  });

  it("counts the rest once more than three scores moved", () => {
    const many = proposed({ A1: 30, A3: 20, B2: 50, C1: 60, Z9: 10 });
    expect(noteOf(many, CONFIG)).toBe("A1 8 → 30, A3 not set → 20, B2 35 → 50 and 2 more");
  });

  it("says so when a version changed something this page does not edit", () => {
    expect(noteOf(as(CONFIG, { version: 2 }), CONFIG)).toBe("No score changed against v1");
  });
});

describe("historyOf", () => {
  it("lists the versions newest first, each read against the one it came from", () => {
    const draft = proposed({ A1: 30 });
    expect(historyOf([CONFIG, draft])).toEqual([
      {
        version: 2,
        status: "draft",
        note: "A1 8 → 30",
        author: "J. Novák",
        date: stamp(draft.createdAt),
      },
      {
        version: 1,
        status: "active",
        note: "First version · 2 rules scored",
        author: "finreg-brief",
        date: stamp(CONFIG.createdAt),
      },
    ]);
  });

  it("names an author the engine has none for", () => {
    expect(historyOf([as(CONFIG, { author: null })])[0]?.author).toBe("unknown");
  });
});
