import { z } from "zod";

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

export const PARAM_UNITS = ["amount", "percent", "multiple", "count"] as const;

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
  status: z.enum(["draft", "approved", "active", "retired"]),
  author: z.string().nullable(),
  createdAt: z.string(),
  explanation: z.string().nullable(),
  explanationModel: z.string().nullable(),
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

/** The engine refused a save (400 or 409); the message is its reason. */
export class RuleRejectedError extends Error {}

const problem = z.object({ detail: z.string() });

export async function fetchRules(signal?: AbortSignal): Promise<RuleVersion[]> {
  const res = await fetch("/api/rules", { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`/api/rules: HTTP ${res.status}`);
  return z.array(ruleVersion).parse(await res.json());
}

export async function saveRule(body: NewRule): Promise<RuleVersion> {
  const res = await fetch("/api/rules", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 400 || res.status === 409) {
    const parsed = problem.safeParse(await res.json().catch(() => null));
    throw new RuleRejectedError(parsed.success ? parsed.data.detail : `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`/api/rules: HTTP ${res.status}`);
  return ruleVersion.parse(await res.json());
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
