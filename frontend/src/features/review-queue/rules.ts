import { czk, type DetailClient, type Hit } from "./api";

// Rule names come from the engine (`rule.name`). Thresholds come from the hit's evidence (`p.*`),
// not from here, because the engine keeps them as config.

/** One line for the queue: the first rule's name, plus how many others fired. */
export function rulesSummary(names: readonly string[]): string {
  const [first, ...rest] = names;
  if (!first) return "Alert raised";
  return rest.length ? `${first} (+${rest.length} more)` : first;
}

export type RuleFacts = {
  rule: string;
  name: string;
  threshold: string;
  actual: string;
  /** actual / threshold; picks the strongest hit of an alert. */
  ratio: number;
};

const num = (hit: Hit, key: string) => {
  const v = hit.evidence[key];
  return typeof v === "number" ? v : 0;
};
const money = (halere: number) => `${Math.round(czk(halere)).toLocaleString("en-US")} CZK`;

/** Threshold vs actual for one hit, in words a reviewer reads at a glance. */
export function ruleFacts(hit: Hit, client: DetailClient): RuleFacts {
  const facts = (f: {
    threshold: number;
    actual: number;
    fmt?: (n: number) => string;
    prefix?: string;
  }) => {
    const fmt = f.fmt ?? money;
    return {
      rule: hit.rule,
      name: hit.name,
      threshold: (f.prefix ?? "") + fmt(f.threshold),
      actual: fmt(f.actual),
      ratio: f.threshold ? f.actual / f.threshold : 0,
    };
  };
  switch (hit.rule) {
    case "A1":
      return facts({
        threshold: (num(hit, "p.projected_pct") / 100) * client.expectedMonthlyHalere,
        actual: num(hit, "day_volume"),
        prefix: `${num(hit, "p.projected_pct")} % of monthly · `,
      });
    case "A2":
      return facts({
        threshold:
          (num(hit, "p.avg_multiple") * client.q2VolumeHalere) / Math.max(client.q2Days, 1),
        actual: num(hit, "day_volume"),
        prefix: `${num(hit, "p.avg_multiple")}× Q2 daily avg · `,
      });
    case "A3":
      return facts({
        threshold: num(hit, "p.max_multiple") * client.q2MaxTxHalere,
        actual: num(hit, "tx.amount"),
        prefix: `${num(hit, "p.max_multiple")}× Q2 max · `,
      });
    case "B1":
      return facts({ threshold: num(hit, "p.country_min"), actual: num(hit, "tx.amount") });
    case "B2":
      return facts({ threshold: num(hit, "p.pep_min"), actual: num(hit, "tx.amount") });
    case "C1": {
      const inflow = num(hit, "inflow");
      return facts({
        threshold: num(hit, "p.forward_pct"),
        actual: inflow ? (num(hit, "outflow") / inflow) * 100 : 0,
        fmt: (n) => `${Math.round(n)} % forwarded`,
        prefix: "≥ ",
      });
    }
    default:
      return { rule: hit.rule, name: hit.name, threshold: "—", actual: "—", ratio: 0 };
  }
}

/** The hit that exceeded its threshold the most. */
export function strongestFacts(hits: Hit[], client: DetailClient): RuleFacts | null {
  return hits.map((h) => ruleFacts(h, client)).toSorted((a, b) => b.ratio - a.ratio)[0] ?? null;
}
