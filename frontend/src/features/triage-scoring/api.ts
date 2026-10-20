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
  /** `draft`, `pending`, `active` or `retired` — the same lifecycle a rule version has. */
  status: z.string(),
  author: z.string().nullable(),
  createdAt: z.string(),
  /** The approver a `pending` version waits for, by name. */
  assignee: z.string().nullable().default(null),
  approver: z.string().nullable().default(null),
  approvedAt: z.string().nullable().default(null),
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

/** One rule's whole triage policy as a proposal carries it. */
export type RuleTriageChange = {
  ruleKey: string;
  baseScore: number;
  autoCloseable: boolean;
  impliesPep: boolean;
};

/** The engine refused a score (400, 403, 404, 409); the message is its reason. */
export class ScoreRejectedError extends Error {}

const problem = z.object({ detail: z.string() });

/** The engine's reason for refusing a request (its problem `detail`), or the status when it gave none. */
const reasonOf = async (res: Response) => {
  const parsed = problem.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.detail : `HTTP ${res.status}`;
};

const json = { Accept: "application/json" };

/**
 * Every stored version, newest first. The active one and the open proposal are read out of this list rather than
 * fetched beside it ([activeOf], [openOf]): one load, and no skew between what the history shows and what the
 * table edits.
 */
export async function fetchTriageConfigs(signal?: AbortSignal): Promise<TriageConfigVersion[]> {
  const res = await fetch("/api/triage/configs", {
    signal,
    headers: { ...json, ...userHeaders() },
  });
  if (!res.ok) throw new Error(await reasonOf(res));
  return z.array(triageConfigVersion).parse(await res.json());
}

/** The version triage runs under. A database with none is an engine error, so the caller treats it as a failure. */
export const activeOf = (versions: TriageConfigVersion[]) =>
  versions.find((v) => v.status === "active") ?? null;

/** The version being decided: a draft being written or one waiting for its approver. At most one at a time. */
export const openOf = (versions: TriageConfigVersion[]) =>
  versions.find((v) => v.status === "draft" || v.status === "pending") ?? null;

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
 * Proposes the changed scores as a draft version. Each body replaces a rule's *whole* policy, so `autoCloseable` and
 * `impliesPep` are carried over by the caller. Nothing triage runs under moves until the draft is approved: the
 * engine writes the open draft when there is one, else derives the next version from the active one.
 */
export async function proposeScores(
  author: string,
  rules: RuleTriageChange[],
): Promise<TriageConfigVersion> {
  return send("/api/triage/config/draft", { author, rules });
}

/** Sends the draft [version] to [approverId] for approval; it turns `pending` and can no longer be edited. */
export async function submitProposal(
  version: number,
  approverId: number,
): Promise<TriageConfigVersion> {
  return send(`/api/triage/config/${version}/submit`, { approverId });
}

/** Activates the pending [version] on behalf of the signed-in approver and retires the one that was active. */
export async function approveProposal(version: number): Promise<TriageConfigVersion> {
  return send(`/api/triage/config/${version}/approve`);
}

/** Sends the pending [version] back to draft, so it can be changed and sent again. */
export async function rejectProposal(version: number): Promise<TriageConfigVersion> {
  return send(`/api/triage/config/${version}/reject`);
}

/** Throws away the draft [version] and everything it proposed. */
export async function discardProposal(version: number): Promise<void> {
  const res = await fetch(`/api/triage/config/${version}`, {
    method: "DELETE",
    headers: { ...json, ...userHeaders() },
  });
  if (REFUSALS.has(res.status)) throw new ScoreRejectedError(await reasonOf(res));
  if (!res.ok) throw new Error(`/api/triage/config/${version}: HTTP ${res.status}`);
}

/** A status the engine refuses a change with, rather than fails on: its `detail` is the reason to show. */
const REFUSALS = new Set([400, 403, 404, 409]);

/** One POST that answers with a config version, with the engine's refusal carried through verbatim. */
async function send(url: string, body: unknown = {}): Promise<TriageConfigVersion> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...json, "Content-Type": "application/json", ...userHeaders() },
    body: JSON.stringify(body),
  });
  if (REFUSALS.has(res.status)) throw new ScoreRejectedError(await reasonOf(res));
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
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
