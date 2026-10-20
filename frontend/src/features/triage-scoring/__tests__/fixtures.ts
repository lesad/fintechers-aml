import type { ScoredRuleVersion, TriageConfigVersion } from "../api";

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

export const CONFIG: TriageConfigVersion = {
  version: 1,
  configVersion: "v1",
  status: "active",
  author: "finreg-brief",
  createdAt: "2026-10-20T09:00:00+02:00",
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

/** The config as the engine returns it after [ruleKey] was rescored: a new activated version. */
export const rescored = (ruleKey: string, baseScore: number): TriageConfigVersion => ({
  ...CONFIG,
  version: CONFIG.version + 1,
  configVersion: "v2",
  rules: [
    ...CONFIG.rules.filter((r) => r.ruleKey !== ruleKey),
    {
      ruleKey,
      baseScore,
      autoCloseable: CONFIG.rules.find((r) => r.ruleKey === ruleKey)?.autoCloseable ?? false,
      impliesPep: CONFIG.rules.find((r) => r.ruleKey === ruleKey)?.impliesPep ?? false,
    },
  ],
});
