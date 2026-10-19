import { formatCzk, type RuleParam, type RuleVersion, type RuleWindow } from "./api";

const reading: Record<RuleParam["unit"], (value: number) => string> = {
  amount: (value) => `${value.toLocaleString("en-US")} haléře (${formatCzk(value)})`,
  percent: (value) => `${value} %`,
  multiple: (value) => `${value}×`,
  count: (value) => String(value),
};

/** `pep_min = 10,000,000 haléře (100,000 CZK)`, `forward_pct = 80 %`, `avg_multiple = 3×`. */
export const paramLabel = (name: string, { value, unit }: RuleParam) =>
  `${name} = ${reading[unit](value)}`;

export const scopeLabel = (v: Pick<RuleVersion, "layer" | "scopeSegmentId" | "scopeClientId">) =>
  v.layer === "company"
    ? "company-wide"
    : v.layer === "segment"
      ? `segment ${v.scopeSegmentId}`
      : `client ${v.scopeClientId}`;

export const grainLabel: Record<RuleVersion["grain"], string> = {
  transaction: "per transaction",
  client_day: "per client day",
  client_anchor: "per anchor transaction",
};

/** ISO-8601 duration (`PT-24H`, `PT30M`, `PT0S`) → signed hours; null when it is not a whole number of minutes. */
export function isoHours(duration: string): number | null {
  const match = /^PT(-?\d+)([HMS])$/.exec(duration);
  if (!match?.[1] || !match[2]) return null;
  const n = Number(match[1]);
  return match[2] === "H" ? n : match[2] === "M" ? n / 60 : n === 0 ? 0 : null;
}

const span = (hours: number) =>
  Number.isInteger(hours) ? `${hours} hours` : `${Math.round(hours * 60)} minutes`;

export function windowLabel(window: RuleWindow): string {
  if (window.kind === "day") return "the client's calendar day";
  const from = isoHours(window.from);
  const to = isoHours(window.to);
  if (from === null || to === null) return `${window.from} to ${window.to} around the anchor`;
  if (from < 0 && to === 0) return `${span(-from)} before the anchor, up to it`;
  if (from === 0 && to >= 0) return `from the anchor to ${span(to)} after it`;
  return `from ${span(-from)} before to ${span(to)} after the anchor`;
}
