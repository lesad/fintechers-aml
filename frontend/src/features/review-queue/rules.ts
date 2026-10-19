import type { Hit } from "./api";

// Rules are dynamic: the UI shows what the engine stored and never interprets or computes it.

/** One line for the queue: the first rule's name, plus how many others fired. */
export function rulesSummary(names: readonly string[]): string {
  const [first, ...rest] = names;
  if (!first) return "Alert raised";
  return rest.length ? `${first} (+${rest.length} more)` : first;
}

export type RuleThresholds = {
  rule: string;
  /** The rule's parameters (`p.*` in the evidence, from `rule_param`) on its first hit, verbatim. */
  params: [key: string, value: string][];
};

/** One entry per rule that fired, in the engine's order, with its parameters as stored. */
export function ruleThresholds(hits: Hit[]): RuleThresholds[] {
  const seen = new Set<string>();
  return hits.flatMap((h) => {
    if (seen.has(h.rule)) return [];
    seen.add(h.rule);
    const params = Object.entries(h.evidence)
      .filter(([k]) => k.startsWith("p."))
      .map(([k, v]): [string, string] => [k, String(v)]);
    return [{ rule: h.rule, params }];
  });
}
