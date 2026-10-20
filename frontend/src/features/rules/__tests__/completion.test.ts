import { describe, expect, it } from "vitest";

import { anchorNames, complete, conditionNames, filterNames, NO_VOCABULARY } from "../completion";
import { draftFrom, newVariable } from "../rule-draft";
import { B2 } from "./fixtures";

import type { Vocabulary } from "../api";

const vocabulary: Vocabulary = {
  tx: { amount: "double", direction: "string", payer_country: "string" },
  client: { pep: "bool", country: "string" },
  day: { month: "int" },
  lists: { high_risk: "list(string)" },
  values: { "tx.direction": ["in", "out", "unknown"] },
};

const labels = (text: string, caret = text.length, names = anchorNames(vocabulary)) =>
  complete(text, caret, { names, values: vocabulary.values })?.candidates.map((c) => c.label);

describe("complete", () => {
  it("offers the fields under a prefix", () => {
    expect(labels("tx.")).toEqual(["tx.amount", "tx.direction", "tx.payer_country"]);
    expect(labels("amount > 5 && tx.pa")).toEqual(["tx.payer_country"]);
  });

  it("matches a bare word against the last part of a name", () => {
    expect(labels("amo")).toEqual(["tx.amount"]);
  });

  it("offers nothing for a complete name, a number or mid-word", () => {
    expect(labels("tx.amount")).toBeUndefined();
    expect(labels("tx.amount > 100")).toBeUndefined();
    expect(labels("tx.am > 1", 4)).toBeUndefined();
  });

  it("replaces the typed word", () => {
    expect(
      complete("x && tx.am", 10, { names: anchorNames(vocabulary), values: {} }),
    ).toMatchObject({
      from: 5,
      to: 10,
      suffix: "",
    });
  });

  it("offers a text field's values inside its string and closes the quote", () => {
    expect(labels('tx.direction == "')).toEqual(["in", "out", "unknown"]);
    expect(complete('tx.direction != "o', 18, { names: [], values: vocabulary.values })).toEqual({
      from: 17,
      to: 18,
      suffix: '"',
      candidates: [{ label: "out", detail: "tx.direction" }],
    });
  });

  it("does not close a quote that is already there", () => {
    expect(
      complete('tx.direction == ""', 17, { names: [], values: vocabulary.values })?.suffix,
    ).toBe("");
  });

  it("replaces the rest of a closed value instead of adding a quote", () => {
    expect(
      complete('tx.direction == "ot"', 18, { names: [], values: vocabulary.values }),
    ).toMatchObject({ from: 17, to: 19, suffix: "" });
  });

  it("offers values inside a list after in", () => {
    expect(labels('tx.direction in ["in", "')).toEqual(["in", "out", "unknown"]);
  });

  it("offers nothing inside a string of a field without listed values", () => {
    expect(labels('tx.payer_country == "C')).toBeUndefined();
  });
});

describe("names per field", () => {
  it("gives a condition the variables, parameters, transaction, client and lists", () => {
    const names = conditionNames(vocabulary, draftFrom(B2)).map((c) => c.label);
    expect(names).toContain("p.pep_min");
    expect(names).toContain("tx.amount");
    expect(names).toContain("client.pep");
    expect(names).toContain("lists.high_risk");
    expect(names).not.toContain("day.month");
  });

  it("gives a client-day condition the day instead of the transaction", () => {
    const names = conditionNames(vocabulary, { ...draftFrom(B2), grain: "client_day" }).map(
      (c) => c.label,
    );
    expect(names).toContain("day.month");
    expect(names).not.toContain("tx.amount");
  });

  it("gives a filter only the variables before it", () => {
    const inflow = newVariable("inflow");
    expect(filterNames(NO_VOCABULARY, [inflow])).toEqual([
      { label: "inflow", detail: `variable · ${inflow.agg}` },
    ]);
  });
});
