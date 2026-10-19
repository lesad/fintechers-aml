import { formatCzk, type RuleVersion, type RuleWindow } from "./api";

// HACK: shortcut: values from 100,000 up read as haléře amounts, smaller ones as percentages or multiples; add a unit to engine parameters when a rule needs a small amount.
const AMOUNT_FROM = 100_000;

/** `pep_min = 10,000,000 haléře (100,000 CZK)` for amounts, `projected_pct = 25` otherwise. */
export const paramLabel = (name: string, value: number) =>
  value >= AMOUNT_FROM
    ? `${name} = ${value.toLocaleString("en-US")} haléře (${formatCzk(value)})`
    : `${name} = ${value}`;

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
