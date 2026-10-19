import { z } from "zod";

// The engine's /api/rules contract (engine/.../rules/RuleJson.kt). Parameter values are integers;
// amounts among them are in haléře.

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
  params: z.record(z.string(), z.number()),
};

const ruleVersion = z.object({
  ...ruleFields,
  id: z.number(),
  version: z.number(),
  status: z.enum(["draft", "approved", "active", "retired"]),
  author: z.string().nullable(),
  createdAt: z.string(),
  explanation: z.string().nullable(),
  explanationModel: z.string().nullable(),
});

export type RuleWindow = z.infer<typeof window>;
export type RuleVariable = z.infer<typeof variable>;
export type RuleVersion = z.infer<typeof ruleVersion>;
export type NewRule = z.infer<z.ZodObject<typeof ruleFields>> & { author: string };

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

/** haléře → "50,000 CZK" */
export const formatCzk = (halere: number) =>
  `${Math.round(halere / 100).toLocaleString("en-US")} CZK`;
