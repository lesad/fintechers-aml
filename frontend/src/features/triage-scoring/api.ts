import { z } from "zod";

import { userHeaders } from "@/user";

/** One rule's whole triage policy, as the active config stores it. */
const ruleTriage = z.object({
  ruleKey: z.string(),
  baseScore: z.number(),
  autoCloseable: z.boolean(),
  impliesPep: z.boolean(),
});

export const DISPOSITIONS = [
  "AUTO_CLOSE",
  "REVIEW_LOW",
  "REVIEW_MEDIUM",
  "REVIEW_HIGH",
  "ESCALATE",
] as const;

const band = z.object({ maxScore: z.number(), disposition: z.enum(DISPOSITIONS) });

/**
 * The rule-agnostic policy. Only what this feature reads is named; the rest of the document travels through
 * untouched, because the engine rebuilds it from the version it activates and we never send it back.
 */
const payload = z.looseObject({
  unknownRuleScore: z.number(),
  bands: z.array(band),
});

const triageConfigVersion = z.object({
  version: z.number(),
  configVersion: z.string(),
  status: z.string(),
  author: z.string().nullable(),
  createdAt: z.string(),
  payload,
  rules: z.array(ruleTriage),
});

const coverage = z.object({ unscored: z.array(z.string()), orphaned: z.array(z.string()) });

/**
 * The slice of a rule version this feature needs. `@/features/rules` owns the full schema, but a feature may not
 * import another feature (ADR-0011), so the few fields a score row shows are declared again here.
 */
const scoredRuleVersion = z.looseObject({
  key: z.string(),
  name: z.string().nullable(),
  alertType: z.string(),
  status: z.enum(["draft", "pending", "approved", "active", "retired"]),
  version: z.number(),
});

export type Disposition = (typeof DISPOSITIONS)[number];
export type Band = z.infer<typeof band>;
export type RuleTriage = z.infer<typeof ruleTriage>;
export type TriageConfigVersion = z.infer<typeof triageConfigVersion>;
export type TriageCoverage = z.infer<typeof coverage>;
export type ScoredRuleVersion = z.infer<typeof scoredRuleVersion>;

/** The engine refused a score (400, 404, 409); the message is its reason. */
export class ScoreRejectedError extends Error {}

const problem = z.object({ detail: z.string() });

/** The engine's reason for refusing a request (its problem `detail`), or the status when it gave none. */
const reasonOf = async (res: Response) => {
  const parsed = problem.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.detail : `HTTP ${res.status}`;
};

const json = { Accept: "application/json" };

/** The active triage config; a 404 (no version is active) carries the engine's own wording. */
export async function fetchTriageConfig(signal?: AbortSignal): Promise<TriageConfigVersion> {
  const res = await fetch("/api/triage/config", { signal, headers: { ...json, ...userHeaders() } });
  if (!res.ok) throw new Error(await reasonOf(res));
  return triageConfigVersion.parse(await res.json());
}

/** Which live rule keys the active config does not score, and which scores no live rule uses. */
export async function fetchTriageCoverage(signal?: AbortSignal): Promise<TriageCoverage> {
  const res = await fetch("/api/triage/coverage", {
    signal,
    headers: { ...json, ...userHeaders() },
  });
  if (!res.ok) throw new Error(await reasonOf(res));
  return coverage.parse(await res.json());
}

/** Every rule version, so a score row can name its rule. */
export async function fetchRuleVersions(signal?: AbortSignal): Promise<ScoredRuleVersion[]> {
  const res = await fetch("/api/rules", { signal, headers: { ...json, ...userHeaders() } });
  if (!res.ok) throw new Error(`/api/rules: HTTP ${res.status}`);
  return z.array(scoredRuleVersion).parse(await res.json());
}

/**
 * Rescores one rule. The body replaces the rule's *whole* policy, so `autoCloseable` and `impliesPep` are carried
 * over by the caller; the engine derives a new config version from the active one and activates it, and returns it.
 */
export async function patchRuleScore(
  ruleKey: string,
  body: { author: string; baseScore: number; autoCloseable: boolean; impliesPep: boolean },
): Promise<TriageConfigVersion> {
  const res = await fetch(`/api/triage/config/rules/${encodeURIComponent(ruleKey)}`, {
    method: "PATCH",
    headers: { ...json, "Content-Type": "application/json", ...userHeaders() },
    body: JSON.stringify(body),
  });
  if ([400, 403, 404, 409].includes(res.status)) throw new ScoreRejectedError(await reasonOf(res));
  if (!res.ok) throw new Error(`/api/triage/config/rules/${ruleKey}: HTTP ${res.status}`);
  return triageConfigVersion.parse(await res.json());
}

/** The rule version a score row describes: the active one, else the newest of that key. */
export function liveVersions(versions: ScoredRuleVersion[]): ScoredRuleVersion[] {
  const keys = [...new Set(versions.map((v) => v.key))].toSorted();
  return keys.flatMap((key) => {
    const ofKey = versions.filter((v) => v.key === key);
    const live = ofKey.find((v) => v.status === "active") ?? ofKey.toSorted(byVersion)[0];
    return live ? [live] : [];
  });
}

const byVersion = (a: ScoredRuleVersion, b: ScoredRuleVersion) => b.version - a.version;
