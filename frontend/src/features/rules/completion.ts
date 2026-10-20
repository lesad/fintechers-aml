import type { Vocabulary } from "./api";
import type { Draft, DraftVariable } from "./rule-draft";

/** A name or value the editor can insert, with what it is (`double`, `variable · sum`, `parameter`). */
export type Candidate = { label: string; detail: string };

/** Replace `text[from, to)` with a candidate's label plus `suffix`. */
export type Completion = { from: number; to: number; suffix: string; candidates: Candidate[] };

export const NO_VOCABULARY: Vocabulary = { tx: {}, client: {}, day: {}, lists: {}, values: {} };

const MAX = 8;

const fields = (prefix: string, types: Record<string, string>): Candidate[] =>
  Object.entries(types).map(([name, type]) => ({ label: `${prefix}.${name}`, detail: type }));

const variables = (rows: DraftVariable[]): Candidate[] =>
  rows
    .filter((x) => x.name.trim())
    .map((x) => ({ label: x.name.trim(), detail: `variable · ${x.agg}` }));

/** What an anchor may name: the transaction's fields. */
export const anchorNames = (v: Vocabulary) => fields("tx", v.tx);

/** What the filter of a variable may name: the transaction's fields and the variables before it. */
export const filterNames = (v: Vocabulary, earlier: DraftVariable[]) => [
  ...fields("tx", v.tx),
  ...variables(earlier),
];

/** What a condition may name; a client-day rule has the day instead of a transaction. */
export const conditionNames = (v: Vocabulary, d: Draft) => [
  ...variables(d.variables),
  ...d.params
    .filter((p) => p.name.trim())
    .map((p) => ({ label: `p.${p.name.trim()}`, detail: "parameter" })),
  ...(d.grain === "client_day" ? fields("day", v.day) : fields("tx", v.tx)),
  ...fields("client", v.client),
  ...fields("lists", v.lists),
];

const OPEN_VALUE = /([\w.]+)\s*(?:==|!=)\s*"([^"]*)$|([\w.]+)\s+in\s*\[[^\]]*"([^"]*)$/;

/** What the field offers: names while typing a word, a text field's values inside its string. */
export type Offer = { names: Candidate[]; values: Vocabulary["values"] };

/**
 * What to offer at `caret`: inside a string compared with a field, that field's values; after a word, the names
 * that start with it, or whose last part does (`amo` → `tx.amount`).
 *
 * @returns null when there is nothing to offer
 * @example
 * complete('tx.direction == "o', 18, { names: [], values: { "tx.direction": ["in", "out"] } });
 * // { from: 17, to: 18, suffix: '"', candidates: [{ label: "out", detail: "tx.direction" }] }
 */
export function complete(text: string, caret: number, offer: Offer): Completion | null {
  const before = text.slice(0, caret);
  if ((before.match(/"/g) ?? []).length % 2 === 1) {
    return completeValue(before, text.slice(caret), offer.values);
  }
  if (/[\w.]/.test(text[caret] ?? "")) return null;
  return completeName(before, offer.names);
}

function completeValue(before: string, after: string, values: Offer["values"]) {
  const open = OPEN_VALUE.exec(before);
  const field = open?.[1] ?? open?.[3] ?? "";
  const typed = open?.[2] ?? open?.[4] ?? "";
  const candidates = (values[field] ?? [])
    .filter((value) => value.startsWith(typed) && value !== typed)
    .map((value) => ({ label: value, detail: field }));
  const rest = /^[^"\s]*"/.exec(after)?.[0];
  const to = before.length + (rest ? rest.length - 1 : 0);
  return found({ from: before.length - typed.length, to, suffix: rest ? "" : '"', candidates });
}

function completeName(before: string, names: Candidate[]) {
  const word = /[A-Za-z_][\w.]*$/.exec(before)?.[0];
  if (!word) return null;
  const others = names.filter((n) => n.label !== word);
  const byLastPart = (n: Candidate) =>
    !n.label.startsWith(word) && n.label.split(".").at(-1)?.startsWith(word);
  const candidates = [
    ...others.filter((n) => n.label.startsWith(word)),
    ...(word.includes(".") ? [] : others.filter(byLastPart)),
  ];
  return found({ from: before.length - word.length, to: before.length, suffix: "", candidates });
}

const found = (c: Completion) =>
  c.candidates.length ? { ...c, candidates: c.candidates.slice(0, MAX) } : null;
