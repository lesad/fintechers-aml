import type { Hit, HistoryTransaction, OpoRule } from "./api";

// Facts for the FAÚ report, all computed from what the engine stored: the rule's own windows decide which hits
// cover the reported transaction and which of the client's transactions make up the flow.

const HOUR = 3_600_000;

/** `PT-24H`, `PT6H`, `-PT30M`, `P1D` → milliseconds. */
export function durationMs(iso: string): number {
  const m = /^(-)?P(?:(-?\d+)D)?(?:T(?:(-?\d+)H)?(?:(-?\d+)M)?(?:(-?\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m) throw new Error(`Unknown duration ${iso}`);
  const [, neg, d = "0", h = "0", min = "0", s = "0"] = m;
  const ms = ((+d * 24 + +h) * 60 + +min) * 60_000 + +s * 1000;
  return neg ? -ms : ms;
}

/** Engine timestamps carry no zone; every comparison stays in that one frame. */
const at = (ts: string) => Date.parse(ts.slice(0, 19));
const dayOf = (ts: string) => ts.slice(0, 10);
const dayStart = (day: string) => at(`${day}T00:00:00`);

export type Span = { from: number; to: number };

/**
 * The stretch of time a hit looked at: the grain's day, or the anchor transaction widened by the rule's
 * variable windows; null when the anchor is not among `txs`.
 */
export function hitSpan(hit: Hit, rule: OpoRule, txs: HistoryTransaction[]): Span | null {
  if (rule.grain === "client_day") {
    const from = dayStart(hit.grainKey);
    return { from, to: from + 24 * HOUR };
  }
  const anchor = txs.find((t) => t.id === hit.grainKey);
  if (!anchor) return null;
  const t = at(anchor.ts);
  return rule.variables.reduce<Span>(
    (span, v) => {
      if (v.window.kind === "day") {
        const from = dayStart(dayOf(anchor.ts));
        return { from: Math.min(span.from, from), to: Math.max(span.to, from + 24 * HOUR) };
      }
      return {
        from: Math.min(span.from, t + durationMs(v.window.from)),
        to: Math.max(span.to, t + durationMs(v.window.to)),
      };
    },
    { from: t, to: t },
  );
}

export const inSpan = (span: Span, ts: string) => at(ts) >= span.from && at(ts) <= span.to;

export type HitFacts = { hit: Hit; rule: OpoRule | undefined; span: Span | null };

/**
 * Splits the alerts' hits into those whose window holds the reported transaction (the grounds) and the
 * client's other hits; a hit whose rule or anchor cannot be found counts as other.
 */
export function splitHits(
  hits: Hit[],
  {
    rules,
    txs,
    reported,
  }: { rules: OpoRule[]; txs: HistoryTransaction[]; reported: HistoryTransaction },
): { grounds: HitFacts[]; other: HitFacts[] } {
  const facts = hits.map((hit): HitFacts => {
    const rule = rules.find((r) => r.key === hit.rule && r.version === hit.version);
    return { hit, rule, span: rule ? hitSpan(hit, rule, txs) : null };
  });
  const covers = (f: HitFacts) =>
    f.hit.grainKey === reported.id || (f.span !== null && inSpan(f.span, reported.ts));
  return { grounds: facts.filter(covers), other: facts.filter((f) => !covers(f)) };
}

/** The client's transactions inside any of the spans, oldest first. */
export function flowOf(spans: Span[], txs: HistoryTransaction[]): HistoryTransaction[] {
  return txs
    .filter((t) => spans.some((s) => inSpan(s, t.ts)))
    .toSorted((a, b) => at(a.ts) - at(b.ts));
}

/** `197918.56` → `197 918,56 CZK` */
export const czk = (n: number) =>
  `${n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CZK`;

/** `2026-07-01T19:42:53` → `1. 7. 2026 19:42`; a zoned instant is shown in local time. */
export function csDateTime(ts: string): string {
  const local = /[Zz]|[+-]\d\d:\d\d$/.test(ts)
    ? new Date(ts).toLocaleString("sv-SE").replace(" ", "T")
    : ts;
  const [y, m, d] = local.slice(0, 10).split("-").map(Number);
  return `${d}. ${m}. ${y} ${local.slice(11, 16)}`;
}

const hours = (ms: number) => {
  const h = Math.abs(ms) / HOUR;
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace(".", ",")} h`;
};

function windowText(rule: OpoRule, hit: Hit, name: string): string {
  const v = rule.variables.find((x) => x.name === name);
  if (!v) return "";
  if (rule.grain === "client_day") return ` v kalendářním dni ${hit.grainKey}`;
  if (v.window.kind === "day") return ` v kalendářním dni obchodu ${hit.grainKey}`;
  const from = durationMs(v.window.from);
  const to = durationMs(v.window.to);
  const edge = (ms: number) =>
    ms === 0
      ? `okamžiku obchodu ${hit.grainKey}`
      : `${hours(ms)} ${ms < 0 ? "před obchodem" : "po obchodu"} ${hit.grainKey}`;
  return ` v okně od ${edge(from)} do ${edge(to)}`;
}

const AGG: Record<string, string> = {
  sum: "součet",
  max: "nejvyšší",
  min: "nejnižší",
  count: "počet",
  set: "seznam",
};
const FIELD: Record<string, string> = {
  amount: "částek",
  payer_account: "účtů plátců",
  payee_account: "účtů příjemců",
  payer_country: "států plátců",
  payee_country: "států příjemců",
};
const UNIT: Record<OpoRule["params"][string]["unit"], (n: number) => string> = {
  amount: czk,
  percent: (n) => `${n.toLocaleString("cs-CZ")} %`,
  multiple: (n) => `${n.toLocaleString("cs-CZ")}×`,
};

const plain = (v: unknown) =>
  Array.isArray(v) ? v.join(", ") : typeof v === "number" ? v.toLocaleString("cs-CZ") : String(v);

type Line = [label: string, value: string];

function paramLine(name: string, value: unknown, rule: OpoRule | undefined): Line {
  const p = rule?.params[name];
  return [`práh ${name}`, p && typeof value === "number" ? UNIT[p.unit](value) : plain(value)];
}

function txLine(field: string, value: unknown, hit: Hit): Line {
  const amount = field === "amount" && typeof value === "number";
  return [
    `${field === "amount" ? "částka" : field} obchodu ${hit.grainKey}`,
    amount ? czk(value) : plain(value),
  ];
}

function variableLine([name, value]: [string, unknown], hit: Hit, rule: OpoRule | undefined): Line {
  const v = rule?.variables.find((x) => x.name === name);
  if (!v || !rule) return [name, plain(value)];
  const money = v.field === "amount" && v.agg !== "count" && typeof value === "number";
  return [
    `${name}: ${AGG[v.agg] ?? v.agg} ${FIELD[v.field] ?? v.field}${windowText(rule, hit, name)}`,
    money ? czk(value) : plain(value),
  ];
}

/**
 * The hit's evidence as Czech lines, label and value: the rule's variables with their aggregation and
 * window, the anchor transaction's fields and the thresholds, amounts in CZK.
 */
export function evidenceLines(hit: Hit, rule: OpoRule | undefined): Line[] {
  return Object.entries(hit.evidence).map(([key, value]) => {
    if (key.startsWith("p.")) return paramLine(key.slice(2), value, rule);
    if (key.startsWith("tx.")) return txLine(key.slice(3), value, hit);
    return variableLine([key, value], hit, rule);
  });
}

// Czech labels for the engine's English codes, as the FAÚ and audit reports print them.

export const DIRECTION: Record<HistoryTransaction["direction"], string> = {
  in: "příchozí",
  out: "odchozí",
  // NOTE: the importer gives only remittances no direction.
  unknown: "remitence",
};
export const TX_TYPE: Record<string, string> = {
  "incoming payment": "příchozí platba",
  "outgoing payment": "odchozí platba",
  remittance: "remitence (převod peněz)",
};
export const CLIENT_TYPE: Record<string, string> = {
  "natural person": "fyzická osoba",
  enterpreneur: "fyzická osoba podnikající",
  "legal entity": "právnická osoba",
};
export const CHANNEL: Record<string, string> = {
  "distant form": "na dálku",
  "in person": "osobně",
};
export const RISK: Record<string, string> = { low: "nízký", medium: "střední", high: "vysoký" };

export const cs = (map: Record<string, string>, v: string | null) =>
  v === null ? null : (map[v] ?? v);
