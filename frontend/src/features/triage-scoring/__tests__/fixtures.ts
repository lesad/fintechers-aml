import type { ScoredRuleVersion, TriageConfigVersion } from "../api";
import type { User } from "@/user";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const problem = (detail: string, status = 400) =>
  new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });

const rule = (key: string, alertType: string, name: string): ScoredRuleVersion => ({
  key,
  alertType,
  name,
  status: "active",
  version: 1,
});

export const RULES: ScoredRuleVersion[] = [
  rule("A1", "A", "Volume far above the client's baseline"),
  rule("A3", "A", "Repeated near-threshold deposits"),
  rule("C1", "C", "Flow-through within a day"),
  rule("B2", "B", "PEP outgoing payment above the limit"),
  // A retired earlier version of a live key: the active one wins.
  { ...rule("B2", "B", "Old wording"), status: "retired", version: 0 },
];

export const ANALYST: User = { id: 1, name: "J. Novák", role: "ANALYST" };
export const OFFICER: User = { id: 2, name: "M. Svobodová", role: "COMPLIANCE_OFFICER" };
export const MANAGER: User = { id: 3, name: "P. Dvořák", role: "COMPLIANCE_MANAGER" };
export const USERS: User[] = [ANALYST, OFFICER, MANAGER];

export const CONFIG: TriageConfigVersion = {
  version: 1,
  configVersion: "v1",
  status: "active",
  author: "finreg-brief",
  createdAt: "2026-10-20T09:00:00+02:00",
  assignee: null,
  approver: null,
  approvedAt: null,
  payload: {
    unknownRuleScore: 70,
    bands: [
      { maxScore: 24, disposition: "AUTO_CLOSE" },
      { maxScore: 44, disposition: "REVIEW_LOW" },
      { maxScore: 64, disposition: "REVIEW_MEDIUM" },
      { maxScore: 84, disposition: "REVIEW_HIGH" },
      { maxScore: 100, disposition: "ESCALATE" },
    ],
  },
  rules: [
    { ruleKey: "A1", baseScore: 8, autoCloseable: true, impliesPep: false },
    { ruleKey: "B2", baseScore: 35, autoCloseable: false, impliesPep: true },
  ],
};

export const COVERAGE = { unscored: ["A3", "C1"], orphaned: [] };

/** The same version, with whatever the lifecycle moved. */
export const as = (
  version: TriageConfigVersion,
  over: Partial<TriageConfigVersion>,
): TriageConfigVersion => ({ ...version, ...over });

/** The draft the engine returns once [scores] were proposed against the active config. */
export const proposed = (
  scores: Record<string, number>,
  over: Partial<TriageConfigVersion> = {},
): TriageConfigVersion => ({
  ...CONFIG,
  version: CONFIG.version + 1,
  configVersion: "v2",
  status: "draft",
  author: ANALYST.name,
  rules: [
    ...CONFIG.rules.filter((r) => !(r.ruleKey in scores)),
    ...Object.entries(scores).map(([ruleKey, baseScore]) => ({
      ruleKey,
      baseScore,
      autoCloseable: CONFIG.rules.find((r) => r.ruleKey === ruleKey)?.autoCloseable ?? false,
      impliesPep: CONFIG.rules.find((r) => r.ruleKey === ruleKey)?.impliesPep ?? false,
    })),
  ],
  ...over,
});
