import { z } from "zod";

import { userHeaders } from "@/user";

const window = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("day") }),
  z.object({ kind: z.literal("relative"), from: z.string(), to: z.string() }),
]);

const variable = z.object({
  name: z.string(),
  agg: z.enum(["sum", "max", "min", "count", "set"]),
  field: z.string(),
  filter: z.string(),
  window,
});

export const PARAM_UNITS = ["amount", "percent", "multiple"] as const;

/** A numeric threshold; an `amount` is in CZK. */
const param = z.object({ value: z.number(), unit: z.enum(PARAM_UNITS) });

const ruleFields = {
  key: z.string(),
  alertType: z.string(),
  layer: z.enum(["company", "segment", "client"]),
  scopeSegmentId: z.number().nullable(),
  scopeClientId: z.string().nullable(),
  grain: z.enum(["transaction", "client_day", "client_anchor"]),
  anchor: z.string().nullable(),
  condition: z.string(),
  replacesKey: z.string().nullable(),
  variables: z.array(variable),
  params: z.record(z.string(), param),
};

const ruleVersion = z.object({
  ...ruleFields,
  id: z.number(),
  version: z.number(),
  name: z.string().nullable(),
  status: z.enum(["draft", "pending", "approved", "active", "retired"]),
  author: z.string().nullable(),
  createdAt: z.string(),
  explanation: z.string().nullable(),
  explanationModel: z.string().nullable(),
  /** The manager a `pending` version waits for. */
  assignee: z.string().nullable(),
  approver: z.string().nullable(),
  approvedAt: z.string().nullable(),
});

export type RuleWindow = z.infer<typeof window>;
export type RuleVariable = z.infer<typeof variable>;
export type RuleParam = z.infer<typeof param>;
export type RuleVersion = z.infer<typeof ruleVersion>;
export type NewRule = z.infer<z.ZodObject<typeof ruleFields>> & {
  author: string;
  /** null keeps the name of the key's latest version. */
  name: string | null;
};

/** The engine refused a rule (400, 403, 409) or could not explain it (502); the message is its reason. */
export class RuleRejectedError extends Error {}

const problem = z.object({ detail: z.string() });

/** The engine's reason for refusing a request (its problem `detail`), or the status when it gave none. */
const reasonOf = async (res: Response) => {
  const parsed = problem.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.detail : `HTTP ${res.status}`;
};

export async function fetchRules(signal?: AbortSignal): Promise<RuleVersion[]> {
  const res = await fetch("/api/rules", {
    signal,
    headers: { Accept: "application/json", ...userHeaders() },
  });
  if (!res.ok) throw new Error(`/api/rules: HTTP ${res.status}`);
  return z.array(ruleVersion).parse(await res.json());
}

/** Sends a rule; a 400, 403, 409 or 502 becomes a {@link RuleRejectedError} carrying the engine's reason. */
async function postRule(
  path: string,
  body: NewRule | null,
  method: "POST" | "PUT" = "POST",
): Promise<unknown> {
  const res = await fetch(path, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...userHeaders() },
    body: body && JSON.stringify(body),
  });
  if ([400, 403, 409, 502].includes(res.status)) {
    throw new RuleRejectedError(await reasonOf(res));
  }
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export const saveRule = async (body: NewRule): Promise<RuleVersion> =>
  ruleVersion.parse(await postRule("/api/rules", body));

/** Overwrites the draft [id]; the engine refuses any other status. */
export const updateRule = async (id: number, body: NewRule): Promise<RuleVersion> =>
  ruleVersion.parse(await postRule(`/api/rules/${id}`, body, "PUT"));

/**
 * Moves a version along its approval: `submit` sends a draft to a manager, `approve` activates a pending one
 * and `reject` returns it to draft; the engine lets only a manager approve or reject.
 */
export const changeRuleStatus = async (
  id: number,
  action: "submit" | "approve" | "reject",
): Promise<RuleVersion> => ruleVersion.parse(await postRule(`/api/rules/${id}/${action}`, null));

/** Deletes the draft [id]; the engine refuses any other status. */
export async function deleteRule(id: number): Promise<void> {
  const res = await fetch(`/api/rules/${id}`, { method: "DELETE", headers: userHeaders() });
  if (res.status === 400) {
    const parsed = problem.safeParse(await res.json().catch(() => null));
    throw new RuleRejectedError(parsed.success ? parsed.data.detail : "HTTP 400");
  }
  if (!res.ok) throw new Error(`/api/rules/${id}: HTTP ${res.status}`);
}

const explanation = z.object({ explanation: z.string(), model: z.string() });

/** Asks the engine to explain a rule as it would be saved, without saving it. */
export const explainRule = async (body: NewRule) =>
  explanation.parse(await postRule("/api/rules/explanation", body));

const types = z.record(z.string(), z.string());

const vocabulary = z.object({
  tx: types,
  client: types,
  day: types,
  lists: types,
  /** Every value a text field with few of them takes in the data, e.g. `tx.direction` → in, out, unknown. */
  values: z.record(z.string(), z.array(z.string())),
});

/** The names a rule may use, by prefix, each with its CEL type. */
export type Vocabulary = z.infer<typeof vocabulary>;

export async function fetchVocabulary(signal?: AbortSignal): Promise<Vocabulary> {
  const res = await fetch("/api/rules/vocabulary", {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`/api/rules/vocabulary: HTTP ${res.status}`);
  return vocabulary.parse(await res.json());
}

/** Rule versions per key: keys alphabetical, newest version first. */
export function groupByKey(versions: RuleVersion[]): { key: string; versions: RuleVersion[] }[] {
  const keys = [...new Set(versions.map((v) => v.key))].toSorted();
  return keys.map((key) => ({
    key,
    versions: versions.filter((v) => v.key === key).toSorted((a, b) => b.version - a.version),
  }));
}

/** `50000` → "50,000 CZK" */
export const formatCzk = (amount: number) => `${amount.toLocaleString("en-US")} CZK`;

const rating = z.enum(["High", "Medium", "Low"]);

const backtest = z.object({
  ruleKey: z.string(),
  ruleName: z.string().nullable(),
  draftId: z.number(),
  draftVersion: z.number(),
  /** The version the draft replaces; null for a new rule. */
  activeVersion: z.number().nullable(),
  from: z.string(),
  to: z.string(),
  /** The engine replays in the background; the counts are 0 until it is DONE. */
  status: z.enum(["RUNNING", "DONE", "FAILED"]),
  error: z.string().nullable(),
  transactions: z.number(),
  newCount: z.number(),
  droppedCount: z.number(),
  changedCount: z.number(),
  unchangedCount: z.number(),
  createdAt: z.string().nullable(),
});

const backtestRow = z.object({
  id: z.string(),
  clientId: z.string(),
  amount: z.number(),
  ts: z.string(),
  before: rating.nullable(),
  after: rating.nullable(),
  change: z.enum(["NEW", "RAISED", "LOWERED", "DROPPED", "UNCHANGED"]),
  note: z.string().nullable(),
});

const backtestRows = z.object({
  items: z.array(backtestRow),
  page: z.number(),
  size: z.number(),
  total: z.number(),
});

export type Backtest = z.infer<typeof backtest>;
export type BacktestRow = z.infer<typeof backtestRow>;
export type BacktestView = "all" | "changed" | "new" | "dropped";

const json = { Accept: "application/json" };

/**
 * Starts replaying `from`..`to` (inclusive dates) with the draft [id] in place of its active version, in place of
 * every stored backtest; resolves at once with the summary, RUNNING. Poll `fetchBacktest` for the result.
 */
export async function runBacktest(
  id: number,
  { from, to }: { from: string; to: string },
): Promise<Backtest> {
  const qs = new URLSearchParams({ from, to });
  const res = await fetch(`/api/rules/${id}/backtest?${qs}`, {
    method: "POST",
    headers: { ...json, ...userHeaders() },
  });
  if (!res.ok) throw new Error(await reasonOf(res));
  return backtest.parse(await res.json());
}

/** The draft's stored backtest; null when it has none. */
export async function fetchBacktest(id: number, signal?: AbortSignal): Promise<Backtest | null> {
  const res = await fetch(`/api/rules/${id}/backtest`, {
    signal,
    headers: { ...json, ...userHeaders() },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await reasonOf(res));
  return backtest.parse(await res.json());
}

/** A page of the stored backtest's rows in one view, in the backtest's order. */
export async function fetchBacktestRows(
  id: number,
  query: { view: BacktestView; page: number; size: number },
  signal?: AbortSignal,
) {
  const qs = new URLSearchParams({
    view: query.view,
    page: String(query.page),
    size: String(query.size),
  });
  const res = await fetch(`/api/rules/${id}/backtest/rows?${qs}`, {
    signal,
    headers: { ...json, ...userHeaders() },
  });
  if (!res.ok) throw new Error(await reasonOf(res));
  return backtestRows.parse(await res.json());
}
