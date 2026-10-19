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

/** The engine refused a rule (400, 409) or could not explain it (502); the message is its reason. */
export class RuleRejectedError extends Error {}

const problem = z.object({ detail: z.string() });

export async function fetchRules(signal?: AbortSignal): Promise<RuleVersion[]> {
  const res = await fetch("/api/rules", {
    signal,
    headers: { Accept: "application/json", ...userHeaders() },
  });
  if (!res.ok) throw new Error(`/api/rules: HTTP ${res.status}`);
  return z.array(ruleVersion).parse(await res.json());
}

/** POSTs a rule; a 400, 409 or 502 becomes a {@link RuleRejectedError} carrying the engine's reason. */
async function postRule(path: string, body: NewRule): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...userHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 400 || res.status === 409 || res.status === 502) {
    const parsed = problem.safeParse(await res.json().catch(() => null));
    throw new RuleRejectedError(parsed.success ? parsed.data.detail : `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export const saveRule = async (body: NewRule): Promise<RuleVersion> =>
  ruleVersion.parse(await postRule("/api/rules", body));

const explanation = z.object({ explanation: z.string(), model: z.string() });

/** Asks the engine to explain a rule as it would be saved, without saving it. */
export const explainRule = async (body: NewRule) =>
  explanation.parse(await postRule("/api/rules/explanation", body));

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
