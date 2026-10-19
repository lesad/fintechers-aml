import { describe, expect, it } from "vitest";

import {
  changedSections,
  type Draft,
  draftFrom,
  draftIssues,
  editedFields,
  toNewRule,
} from "../rule-draft";
import { B2, C1_V2 } from "./fixtures";

const empty = draftFrom(null);
const texts = (d: Draft, isNew = false, keys: string[] = []) =>
  draftIssues(d, isNew, new Set(keys)).map((i) => `${i.level}: ${i.text}`);

describe("draftFrom and toNewRule", () => {
  it("keeps amounts in CZK, decimals included", () => {
    const draft = draftFrom(B2);
    expect(draft.params).toEqual([{ name: "pep_min", value: "100000", unit: "amount" }]);
    expect(
      toNewRule(
        { ...draft, params: [{ name: "pep_min", value: "50000.5", unit: "amount" }] },
        B2,
        "J. Novák",
      ),
    ).toMatchObject({
      key: "B2",
      layer: "company",
      params: { pep_min: { value: 50_000.5, unit: "amount" } },
    });
  });

  it("keeps a version's windows in hours and its scope", () => {
    const rule = toNewRule(draftFrom(C1_V2), C1_V2, "J. Novák");
    expect(rule.variables[0]?.window).toEqual({ kind: "relative", from: "PT-24H", to: "PT0H" });
    expect(rule.anchor).toBe('tx.direction == "in"');
    expect(rule.params.forward_pct).toEqual({ value: 80, unit: "percent" });
  });

  it("a new rule gets an upper-case key and stays company-wide", () => {
    const rule = toNewRule(
      { ...empty, key: " c2 ", name: "Test", condition: "true" },
      null,
      "J. Novák",
    );
    expect(rule).toMatchObject({
      key: "C2",
      name: "Test",
      layer: "company",
      scopeClientId: null,
      replacesKey: null,
    });
  });
});

describe("draftIssues", () => {
  it("a blank new rule needs a code, a name and a condition", () => {
    expect(texts(empty, true)).toEqual([
      "error: Rule code is required.",
      "error: Name is required.",
      "error: Condition is required.",
    ]);
  });

  it("a new rule may not reuse an existing code", () => {
    expect(texts({ ...draftFrom(B2), key: "b2" }, true, ["B2"])).toContain(
      "error: B2 already exists — open it and create a new version instead.",
    );
  });

  it("a parameter used but not defined is an error whose fix adds it", () => {
    const draft = { ...draftFrom(B2), condition: `${B2.condition} && tx.amount < p.cap` };
    const issue = draftIssues(draft, false, new Set()).find((i) => i.text.includes("p.cap"));
    expect(issue).toMatchObject({ level: "error", text: "p.cap is used but not defined." });
    const fixed = issue?.fix?.apply(draft);
    expect(fixed?.params.map((p) => p.name)).toEqual(["pep_min", "cap"]);
  });

  it("an unknown name is an error whose fix adds it as a variable", () => {
    const draft = { ...draftFrom(B2), condition: "volume > p.pep_min" };
    const issue = draftIssues(draft, false, new Set()).find((i) => i.text.startsWith("volume"));
    expect(issue?.fix?.label).toBe("Add as variable");
    expect(issue?.fix?.apply(draft).variables.map((v) => v.name)).toEqual(["volume"]);
  });

  it("a function call is not an unknown name", () => {
    const draft = {
      ...draftFrom(C1_V2),
      condition:
        "size(payers) > 2 && inflow > p.min_inflow && outflow * 100 >= p.forward_pct * inflow",
    };
    expect(texts(draft).filter((t) => t.startsWith("error"))).toEqual([]);
  });

  it("warns about an unused parameter and rejects a bad value or a missing unit", () => {
    const draft = {
      ...draftFrom(B2),
      params: [
        { name: "pep_min", value: "1 000", unit: "amount" as const },
        { name: "spare", value: "5", unit: "" as const },
      ],
    };
    expect(texts(draft)).toEqual([
      "error: p.pep_min needs a number.",
      "warn: p.spare is defined but not used.",
      "error: p.spare needs a unit.",
    ]);
  });
});

describe("changedSections", () => {
  it("names only the sections that differ from the base version", () => {
    const base = draftFrom(B2);
    const edited = {
      ...base,
      params: [{ name: "pep_min", value: "50000", unit: "amount" as const }],
    };
    expect([...changedSections(edited, base)]).toEqual(["params"]);
    expect(changedSections(base, base).size).toBe(0);
  });
});

describe("editedFields", () => {
  it("names the edited fields, rows by position", () => {
    const base = draftFrom(B2);
    const edited = {
      ...base,
      name: "x",
      params: [{ name: "pep_min", value: "1", unit: "amount" as const }],
    };
    expect(editedFields(base, edited)).toEqual(["name", "params.0.value"]);
  });

  it("a row just added is not edited yet", () => {
    const base = draftFrom(B2);
    expect(
      editedFields(base, { ...base, params: [...base.params, { name: "", value: "", unit: "" }] }),
    ).toEqual([]);
  });
});

describe("issue fields", () => {
  it("ties an empty required field's issue to that field", () => {
    const fields = draftIssues(draftFrom(null), true, new Set()).map((i) => i.field);
    expect(fields).toEqual(["key", "name", "condition"]);
  });

  it("a value typed wrong is not tied to a field, so it shows at once", () => {
    const draft = {
      ...draftFrom(B2),
      params: [{ name: "pep_min", value: "1 000", unit: "amount" as const }],
    };
    expect(
      draftIssues(draft, false, new Set()).find((i) => i.text.includes("needs a number"))?.field,
    ).toBeUndefined();
  });
});
