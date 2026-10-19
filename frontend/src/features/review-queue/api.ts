import { z } from "zod";

// The engine's /api/transactions contract (engine/.../transaction/TransactionModel.kt).
// Amounts arrive in haléře; everything else is parsed here, so the UI never trusts a raw shape.

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

const flagged = z.object({
  id: z.string(),
  clientId: z.string(),
  ts: z.string(),
  amountHalere: z.number(),
  volume: z.number(),
  currency: z.string(),
  direction,
  alertTypes: z.array(z.string()),
  rules: z.array(z.object({ key: z.string(), name: z.string() })),
  rating,
  disposition,
  score: z.number(),
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

const detail = z.object({
  transaction: z.object({
    id: z.string(),
    clientId: z.string(),
    ts: z.string(),
    amountHalere: z.number(),
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
    expectedMonthlyHalere: z.number(),
    expectedCount: z.number(),
    q2VolumeHalere: z.number(),
    q2TxCount: z.number(),
    q2MaxTxHalere: z.number(),
    q2Days: z.number(),
  }),
  rating: rating.nullable(),
  disposition: disposition.nullable(),
  alerts: z.array(
    z.object({
      id: z.number(),
      alertType: z.string(),
      createdAt: z.string(),
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
  history: z.array(
    z.object({
      id: z.string(),
      ts: z.string(),
      direction,
      counterpartyAccount: z.string().nullable(),
      counterpartyCountry: z.string().nullable(),
      amountHalere: z.number(),
      alertTypes: z.array(z.string()),
    }),
  ),
});

export type FlaggedTransaction = z.infer<typeof flagged>;
export type TransactionPage = z.infer<typeof page>;
export type Hit = z.infer<typeof hit>;
export type Disposition = z.infer<typeof disposition>;
export type TransactionDetail = z.infer<typeof detail>;
export type DetailClient = TransactionDetail["client"];
export type HistoryTransaction = TransactionDetail["history"][number];

export class NotFoundError extends Error {}

async function get<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
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

export function fetchDetail(id: string, signal?: AbortSignal): Promise<TransactionDetail> {
  return get(`/api/transactions/${encodeURIComponent(id)}`, detail, signal);
}

/** haléře → CZK */
export const czk = (halere: number) => halere / 100;
