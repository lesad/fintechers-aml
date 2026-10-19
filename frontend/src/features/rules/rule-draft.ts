import { conditionTokens, isoHours } from "./format";

import type { NewRule, RuleParam, RuleVariable, RuleVersion } from "./api";

export type DraftParam = { name: string; value: string; unit: RuleParam["unit"] | "" };

export type DraftVariable = {
  name: string;
  agg: RuleVariable["agg"];
  field: string;
  filter: string;
  kind: "day" | "relative";
  /** Hours relative to the anchor transaction, as typed. */
  from: string;
  to: string;
};

/** The editor's state: values and window hours as the user types them. */
export type Draft = {
  key: string;
  alertType: string;
  name: string;
  grain: RuleVersion["grain"];
  anchor: string;
  condition: string;
  params: DraftParam[];
  variables: DraftVariable[];
};

export type DraftSection = "name" | "grain" | "condition" | "params" | "variables";

export type Issue = {
  section: "identity" | "condition" | "params" | "variables";
  level: "error" | "warn";
  text: string;
  fix?: { label: string; apply: (d: Draft) => Draft };
};

const hours = (iso: string) => String(isoHours(iso) ?? 0);

export const newVariable = (name = ""): DraftVariable => ({
  name,
  agg: "sum",
  field: "amount",
  filter: "true",
  kind: "day",
  from: "-24",
  to: "0",
});

export function draftFrom(v: RuleVersion | null): Draft {
  if (!v) {
    return {
      key: "",
      alertType: "A",
      name: "",
      grain: "transaction",
      anchor: "",
      condition: "",
      params: [],
      variables: [],
    };
  }
  return {
    key: v.key,
    alertType: v.alertType,
    name: v.name ?? "",
    grain: v.grain,
    anchor: v.anchor ?? "",
    condition: v.condition,
    params: Object.entries(v.params).map(([name, { value, unit }]) => ({
      name,
      value: String(value),
      unit,
    })),
    variables: v.variables.map((x) => ({
      name: x.name,
      agg: x.agg,
      field: x.field,
      filter: x.filter,
      kind: x.window.kind,
      from: x.window.kind === "relative" ? hours(x.window.from) : "-24",
      to: x.window.kind === "relative" ? hours(x.window.to) : "0",
    })),
  };
}

/** The POST body for a draft; a new version keeps the layer, scope and replaces of the version it starts from. */
export function toNewRule(d: Draft, from: RuleVersion | null, author: string): NewRule {
  return {
    key: from?.key ?? d.key.trim().toUpperCase(),
    name: d.name.trim(),
    alertType: d.alertType,
    layer: from?.layer ?? "company",
    scopeSegmentId: from?.scopeSegmentId ?? null,
    scopeClientId: from?.scopeClientId ?? null,
    replacesKey: from?.replacesKey ?? null,
    grain: d.grain,
    anchor: d.grain === "client_anchor" ? d.anchor.trim() : null,
    condition: d.condition.trim(),
    variables: d.variables.map((x) => ({
      name: x.name.trim(),
      agg: x.agg,
      field: x.field.trim(),
      filter: x.filter.trim() || "true",
      window:
        x.kind === "day"
          ? { kind: "day" }
          : { kind: "relative", from: `PT${Number(x.from)}H`, to: `PT${Number(x.to)}H` },
    })),
    params: Object.fromEntries(
      d.params.map((p) => [
        p.name.trim(),
        {
          value: Number(p.value),
          // NOTE: draftIssues blocks the save while a unit is missing, so "" never reaches here.
          unit: p.unit as RuleParam["unit"],
        },
      ]),
    ),
    author,
  };
}

const DATA_FIELD = /^(tx|client|lists)\./;

/** Names in the condition that are neither a variable, a parameter, a data field, a keyword nor a function call. */
export function unknownNames(d: Draft): string[] {
  const variables = new Set(d.variables.map((x) => x.name.trim()).filter(Boolean));
  const tokens = conditionTokens(d.condition, variables);
  const unknown = tokens.filter(
    (t, i) => t.kind === "field" && !DATA_FIELD.test(t.text) && tokens[i + 1]?.text !== "(",
  );
  return [...new Set(unknown.map((t) => t.text))];
}

const usedParams = (d: Draft) => {
  const sources = [
    d.condition,
    d.grain === "client_anchor" ? d.anchor : "",
    ...d.variables.map((x) => x.filter),
  ];
  return [...new Set([...sources.join(" ").matchAll(/p\.(\w+)/g)].map((m) => m[1] ?? ""))];
};

const mentions = (d: Draft, name: string) =>
  new RegExp(`(^|[^\\w.])${name}(?!\\w)`).test(
    [
      d.condition,
      d.grain === "client_anchor" ? d.anchor : "",
      ...d.variables.map((x) => x.filter),
    ].join(" "),
  );

function identityIssues(d: Draft, isNew: boolean, existingKeys: Set<string>): Issue[] {
  const issues: Issue[] = [];
  const key = d.key.trim().toUpperCase();
  if (isNew && !key)
    issues.push({ section: "identity", level: "error", text: "Rule code is required." });
  if (isNew && existingKeys.has(key)) {
    issues.push({
      section: "identity",
      level: "error",
      text: `${key} already exists — open it and create a new version instead.`,
    });
  }
  if (!d.name.trim())
    issues.push({ section: "identity", level: "error", text: "Name is required." });
  return issues;
}

function conditionIssues(d: Draft): Issue[] {
  const issues: Issue[] = [];
  if (!d.condition.trim())
    issues.push({ section: "condition", level: "error", text: "Condition is required." });
  if (d.grain === "client_anchor" && !d.anchor.trim()) {
    issues.push({
      section: "condition",
      level: "error",
      text: "Say which transactions anchor the rule.",
    });
  }
  for (const name of unknownNames(d)) {
    issues.push({
      section: "condition",
      level: "error",
      text: `${name} is not a variable, parameter or data field (tx., client., lists.).`,
      fix: {
        label: "Add as variable",
        apply: (x) => ({ ...x, variables: [...x.variables, newVariable(name)] }),
      },
    });
  }
  return issues;
}

const NUMBER = /^\d+(\.\d+)?$/;

const missingParam = (name: string): Issue => ({
  section: "params",
  level: "error",
  text: `p.${name} is used but not defined.`,
  fix: {
    label: `Add p.${name}`,
    apply: (x) => ({ ...x, params: [...x.params, { name, value: "", unit: "" }] }),
  },
});

const valueProblem = ({ value }: DraftParam) => (NUMBER.test(value) ? null : "needs a number");

function oneParamIssues(p: DraftParam, used: string[]): Issue[] {
  const name = p.name.trim();
  if (!name) return [{ section: "params", level: "error", text: "A parameter has no name." }];
  const issues: Issue[] = [];
  if (!used.includes(name))
    issues.push({ section: "params", level: "warn", text: `p.${name} is defined but not used.` });
  const problem = valueProblem(p);
  if (problem) issues.push({ section: "params", level: "error", text: `p.${name} ${problem}.` });
  if (!p.unit) issues.push({ section: "params", level: "error", text: `p.${name} needs a unit.` });
  return issues;
}

function paramIssues(d: Draft): Issue[] {
  const used = usedParams(d);
  const defined = new Set(d.params.map((p) => p.name.trim()).filter(Boolean));
  return [
    ...used.filter((n) => !defined.has(n)).map(missingParam),
    ...d.params.flatMap((p) => oneParamIssues(p, used)),
  ];
}

const HOURS = /^-?\d+$/;

const variableIssue = (level: Issue["level"], text: string): Issue => ({
  section: "variables",
  level,
  text,
});

function oneVariableIssues(d: Draft, x: DraftVariable): Issue[] {
  const name = x.name.trim();
  const label = name || "A variable";
  return [
    !name && variableIssue("error", "A variable has no name."),
    name && !mentions(d, name) && variableIssue("warn", `${name} is defined but not used.`),
    !x.field.trim() && variableIssue("error", `${label} needs a field.`),
    x.kind === "relative" &&
      !(HOURS.test(x.from) && HOURS.test(x.to)) &&
      variableIssue("error", `${label}: window hours must be whole numbers.`),
  ].filter((i): i is Issue => Boolean(i));
}

const variableIssues = (d: Draft) => d.variables.flatMap((x) => oneVariableIssues(d, x));

/** Everything that blocks a save (`error`) or deserves a look (`warn`), in the order the sections appear. */
export const draftIssues = (d: Draft, isNew: boolean, existingKeys: Set<string>): Issue[] => [
  ...identityIssues(d, isNew, existingKeys),
  ...conditionIssues(d),
  ...paramIssues(d),
  ...variableIssues(d),
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function changedSections(d: Draft, base: Draft): Set<DraftSection> {
  const changed = new Set<DraftSection>();
  if (d.name !== base.name) changed.add("name");
  if (d.grain !== base.grain || (d.grain === "client_anchor" && d.anchor !== base.anchor))
    changed.add("grain");
  if (d.condition !== base.condition) changed.add("condition");
  if (!same(d.params, base.params)) changed.add("params");
  if (!same(d.variables, base.variables)) changed.add("variables");
  return changed;
}
