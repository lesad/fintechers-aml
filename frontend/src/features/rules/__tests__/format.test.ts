import { describe, expect, it } from "vitest";

import { conditionTokens, paramParts, windowShort } from "../format";

describe("conditionTokens", () => {
  const kinds = (src: string, variables: string[] = []) =>
    conditionTokens(src, new Set(variables))
      .filter((t) => t.text.trim())
      .map((t) => [t.text, t.kind]);

  it("tells parameters, variables, data fields and constants apart", () => {
    expect(kinds('inflow > p.min_inflow && tx.direction in ["out"]', ["inflow"])).toEqual([
      ["inflow", "variable"],
      [">", "plain"],
      ["p.min_inflow", "param"],
      ["&&", "plain"],
      ["tx.direction", "field"],
      ["in", "keyword"],
      ["[", "plain"],
      ['"out"', "constant"],
      ["]", "plain"],
    ]);
  });

  it("keeps every character, whitespace included", () => {
    const src = "outflow * 100 >= p.forward_pct * inflow";
    expect(
      conditionTokens(src, new Set())
        .map((t) => t.text)
        .join(""),
    ).toBe(src);
  });
});

describe("paramParts", () => {
  it("shows an amount in CZK, a percentage, a multiple and a count by unit", () => {
    expect(paramParts({ value: 10_000_000, unit: "amount" })).toEqual({
      value: "100,000",
      unit: "CZK",
    });
    expect(paramParts({ value: 80, unit: "percent" })).toEqual({ value: "80", unit: "%" });
    expect(paramParts({ value: 3, unit: "multiple" })).toEqual({ value: "3", unit: "×" });
    expect(paramParts({ value: 5, unit: "count" })).toEqual({ value: "5", unit: "" });
  });
});

describe("windowShort", () => {
  it("writes a day, a window before the anchor and one after it", () => {
    expect(windowShort({ kind: "day" })).toBe("day");
    expect(windowShort({ kind: "relative", from: "PT-24H", to: "PT0S" })).toBe(
      "relative · −24 h → 0 h",
    );
    expect(windowShort({ kind: "relative", from: "PT0S", to: "PT6H" })).toBe(
      "relative · 0 h → +6 h",
    );
  });
});
