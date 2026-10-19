import { z } from "zod";

import { userHeaders } from "@/user";

// The engine's /api/transactions contract (engine/.../transaction/TransactionModel.kt).
// Amounts arrive in CZK; everything else is parsed here, so the UI never trusts a raw shape.

const rating = z.enum(["High", "Medium", "Low"]);
const direction = z.enum(["in", "out", "unknown"]);
/** Triage dispositions, mildest first (engine triage/TriageModel.kt). */
const disposition = z.enum([
  "AUTO_CLOSE",
  "REVIEW_LOW",
  "REVIEW_MEDIUM",
  "REVIEW_HIGH",
  "ESCALATE",
]);

/** Where a case stands on the engine (`alert.status`). */
const alertStatus = z.enum(["NEW", "ESCALATED", "FALSE_POSITIVE", "REPORTED"]);

const flagged = z.object({
  id: z.string(),
  clientId: z.string(),
  ts: z.string(),
  amount: z.number(),
  volume: z.number(),
  currency: z.string(),
  direction,
  alertTypes: z.array(z.string()),
  rules: z.array(z.object({ key: z.string(), name: z.string() })),
  rating,
  disposition,
  score: z.number(),
  status: alertStatus,
  flaggedAt: z.string(),
});

const page = z.object({
  items: z.array(flagged),
  page: z.number(),
  size: z.number(),
  total: z.number(),
  countsByRating: z.object({ High: z.number(), Medium: z.number(), Low: z.number() }),
});

const hit = z.object({
  rule: z.string(),
  name: z.string(),
  version: z.number(),
  grainKey: z.string(),
  evidence: z.record(z.string(), z.unknown()),
});

/** One of the client's transactions, as the history and the money flow show it. */
const historyTx = z.object({
  id: z.string(),
  ts: z.string(),
  direction,
  counterpartyAccount: z.string().nullable(),
  counterpartyCountry: z.string().nullable(),
  amount: z.number(),
  alertTypes: z.array(z.string()),
});

const detail = z.object({
  transaction: z.object({
    id: z.string(),
    clientId: z.string(),
    ts: z.string(),
    amount: z.number(),
    volume: z.number(),
    currency: z.string(),
    fxRate: z.number(),
    direction,
    type: z.string(),
    payerAccount: z.string().nullable(),
    payerCountry: z.string().nullable(),
    payeeAccount: z.string().nullable(),
    payeeCountry: z.string().nullable(),
  }),
  client: z.object({
    id: z.string(),
    country: z.string().nullable(),
    contractDate: z.string().nullable(),
    channel: z.string().nullable(),
    pep: z.boolean(),
    type: z.string().nullable(),
    risk: z.string().nullable(),
    expectedMonthly: z.number(),
    expectedCount: z.number(),
    q2Volume: z.number(),
    q2TxCount: z.number(),
    q2MaxTx: z.number(),
    q2Days: z.number(),
  }),
  rating: rating.nullable(),
  disposition: disposition.nullable(),
  status: alertStatus.nullable(),
  alerts: z.array(
    z.object({
      id: z.number(),
      alertType: z.string(),
      createdAt: z.string(),
      status: alertStatus,
      triage: z
        .object({
          disposition,
          score: z.number(),
          reasons: z.array(
            z.object({ code: z.string(), description: z.string(), points: z.number() }),
          ),
          configVersion: z.string(),
          decidedAt: z.string().nullable(),
        })
        .nullable(),
      hits: z.array(hit),
    }),
  ),
  /** The client's transactions on this one's day, it among them. */
  day: z.array(historyTx),
  historyCount: z.number(),
});

const historyPage = z.object({ items: z.array(historyTx), more: z.boolean() });

export type FlaggedTransaction = z.infer<typeof flagged>;
export type TransactionPage = z.infer<typeof page>;
export type Hit = z.infer<typeof hit>;
export type Disposition = z.infer<typeof disposition>;
export type AlertStatus = z.infer<typeof alertStatus>;
export type TransactionDetail = z.infer<typeof detail>;
export type DetailClient = TransactionDetail["client"];
export type HistoryTransaction = z.infer<typeof historyTx>;
export type HistoryPage = z.infer<typeof historyPage>;

export class NotFoundError extends Error {}

async function get<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json", ...userHeaders() },
  });
  if (res.status === 404) throw new NotFoundError(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return schema.parse(await res.json());
}

export function fetchFlagged(
  params: { q: string; rating: string; status: string; page: number; size: number },
  signal?: AbortSignal,
): Promise<TransactionPage> {
  const qs = new URLSearchParams({ page: String(params.page), size: String(params.size) });
  if (params.q.trim()) qs.set("q", params.q.trim());
  if (params.rating !== "all") qs.set("rating", params.rating);
  if (params.status) qs.set("status", params.status);
  return get(`/api/transactions?${qs}`, page, signal);
}

/** Pins the status of the transaction's alerts in the latest run, e.g. `ESCALATED`. */
export async function setStatus(id: string, status: string): Promise<void> {
  const url = `/api/transactions/${encodeURIComponent(id)}/status`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...userHeaders() },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Saving the status failed (HTTP ${res.status}).`);
}

/** Up to 5 of the client's transactions right before (`older`) or after (`newer`) transaction `id`. */
export function fetchHistory(
  id: string,
  { side, limit }: { side: "older" | "newer"; limit: number },
  signal?: AbortSignal,
): Promise<HistoryPage> {
  const qs = new URLSearchParams({ direction: side, limit: String(limit) });
  return get(`/api/transactions/${encodeURIComponent(id)}/history?${qs}`, historyPage, signal);
}

export function fetchDetail(id: string, signal?: AbortSignal): Promise<TransactionDetail> {
  return get(`/api/transactions/${encodeURIComponent(id)}`, detail, signal);
}

// The engine's /api/alerts/{id}/suggestion contract (engine/.../suggestion/SuggestionModel.kt).
// `rule` has the shape of the /api/rules POST body without `author`.

const param = z.object({
  value: z.number(),
  unit: z.enum(["amount", "percent", "multiple"]),
});

const suggestedRule = z.object({
  key: z.string(),
  version: z.number(),
  /** Null keeps the key's latest name. */
  name: z.string().nullable(),
  alertType: z.string(),
  layer: z.enum(["company", "segment", "client"]),
  scopeSegmentId: z.number().nullable(),
  scopeClientId: z.string().nullable(),
  grain: z.enum(["transaction", "client_day", "client_anchor"]),
  anchor: z.string().nullable(),
  condition: z.string(),
  replacesKey: z.string().nullable(),
  variables: z.array(
    z.object({
      name: z.string(),
      agg: z.enum(["sum", "max", "min", "count", "set"]),
      field: z.string(),
      filter: z.string(),
      window: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("day") }),
        z.object({ kind: z.literal("relative"), from: z.string(), to: z.string() }),
      ]),
    }),
  ),
  params: z.record(z.string(), param),
});

const impactCounts = z.object({
  hitsStopped: z.number(),
  hitsAdded: z.number(),
  alertsClosed: z.number(),
  closedByDisposition: z.record(z.string(), z.number()),
});

const impact = z.object({
  stopsThisAlert: z.boolean(),
  closesThisAlert: z.boolean(),
  client: impactCounts,
  company: impactCounts.nullable(),
});

const suggestion = z.object({
  kind: z.enum(["rule_version", "none"]),
  explanation: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })),
  rule: suggestedRule.nullable(),
  previousParams: z.record(z.string(), param).nullable(),
  retires: z.object({ key: z.string(), version: z.number() }).nullable(),
  ruleExplanation: z.string().nullable(),
  impact: impact.nullish(),
  declined: z.string().nullish(),
});

export type Suggestion = z.infer<typeof suggestion>;
export type SuggestedRule = z.infer<typeof suggestedRule>;
export type Impact = z.infer<typeof impact>;
export type ImpactCounts = z.infer<typeof impactCounts>;

/** Asks the engine for a rule change from a false-positive reason; nothing is saved. */
export async function fetchSuggestion(
  alertId: number,
  reason: string,
  signal?: AbortSignal,
): Promise<Suggestion> {
  const url = `/api/alerts/${alertId}/suggestion`;
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const problem = z.object({ detail: z.string() }).safeParse(await res.json().catch(() => null));
    throw new Error(problem.success ? problem.data.detail : `${url}: HTTP ${res.status}`);
  }
  return suggestion.parse(await res.json());
}
