import type { RuleParam, RuleVersion, RuleWindow } from "./api";

const unitSuffix: Record<RuleParam["unit"], string> = {
  amount: "CZK",
  percent: "%",
  multiple: "×",
  count: "",
};

/** A parameter's display value and unit: an amount is CZK already (ADR-0037), the rest as stored. */
export const paramParts = ({ value, unit }: RuleParam) => ({
  value: value.toLocaleString("en-US"),
  unit: unitSuffix[unit],
});

export const paramText = (param: RuleParam) => {
  const { value, unit } = paramParts(param);
  return unit ? `${value} ${unit}` : value;
};

export const scopeLabel = (v: Pick<RuleVersion, "layer" | "scopeSegmentId" | "scopeClientId">) =>
  v.layer === "company"
    ? "Company-wide"
    : v.layer === "segment"
      ? `Segment ${v.scopeSegmentId}`
      : `Client ${v.scopeClientId}`;

export const grainLabel: Record<RuleVersion["grain"], string> = {
  transaction: "Per transaction",
  client_day: "Per client day",
  client_anchor: "Per anchor transaction",
};

/** ISO-8601 duration (`PT-24H`, `PT30M`, `PT0S`) → signed hours; null when it is not a whole number of minutes. */
export function isoHours(duration: string): number | null {
  const match = /^PT(-?\d+)([HMS])$/.exec(duration);
  if (!match?.[1] || !match[2]) return null;
  const n = Number(match[1]);
  return match[2] === "H" ? n : match[2] === "M" ? n / 60 : n === 0 ? 0 : null;
}

const signedHours = (iso: string) => {
  const h = isoHours(iso);
  if (h === null) return iso;
  return h < 0 ? `−${-h}` : h > 0 ? `+${h}` : "0";
};

export const windowShort = (window: RuleWindow) =>
  window.kind === "day"
    ? "day"
    : `relative · ${signedHours(window.from)} h → ${signedHours(window.to)} h`;

export type TokenKind = "param" | "variable" | "field" | "constant" | "keyword" | "plain";

const KEYWORDS = new Set(["in", "true", "false"]);
const TOKEN = /(p\.\w+)|("[^"]*")|([a-z_][\w.]*)|(\d[\d.]*)|(\s+)|(&&|\|\||==|!=|>=|<=|.)/gi;

/** Splits a CEL condition into coloured tokens; joined back they are the source unchanged. */
export function conditionTokens(src: string, variables: Set<string>) {
  return [...src.matchAll(TOKEN)].map((m) => {
    const text = m[0];
    let kind: TokenKind = "plain";
    if (m[1]) kind = "param";
    else if (m[2] || m[4]) kind = "constant";
    else if (m[3])
      kind = KEYWORDS.has(text) ? "keyword" : variables.has(text) ? "variable" : "field";
    return { text, kind, at: m.index };
  });
}

/** `2026-10-19T16:42:05+02:00` → `2026-10-19 16:42`, as the engine wrote it. */
export const shortDate = (iso: string) => iso.slice(0, 16).replace("T", " ");
