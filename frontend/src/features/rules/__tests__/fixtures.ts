import type { RuleVariable, RuleVersion } from "../api";

const b2Condition = 'client.pep && tx.amount > p.pep_min && tx.direction in ["out", "unknown"]';
const c1Condition = "inflow > p.min_inflow && outflow * 100.0 >= p.forward_pct * inflow";

const base = {
  status: "active" as const,
  layer: "company" as const,
  scopeSegmentId: null,
  scopeClientId: null,
  anchor: null,
  replacesKey: null,
  variables: [],
  author: "finreg-brief",
  createdAt: "2026-10-19T10:00:00+02:00",
  explanationModel: "eu.anthropic.claude-opus-4-5-20251101-v1:0",
  assignee: null,
  approver: null,
  approvedAt: null,
};

const c1Variables = (outflowFilter: string): RuleVariable[] => [
  {
    name: "inflow",
    agg: "sum",
    field: "amount",
    filter: 'tx.direction == "in"',
    window: { kind: "relative", from: "PT-24H", to: "PT0S" },
  },
  {
    name: "payers",
    agg: "set",
    field: "payer_account",
    filter: 'tx.direction == "in"',
    window: { kind: "relative", from: "PT-24H", to: "PT0S" },
  },
  {
    name: "outflow",
    agg: "sum",
    field: "amount",
    filter: outflowFilter,
    window: { kind: "relative", from: "PT0S", to: "PT6H" },
  },
];

/** Seeded rule versions as `GET /api/rules` returns them (C1 v1 has no explanation yet). */
export const A1: RuleVersion = {
  ...base,
  id: 1,
  key: "A1",
  version: 1,
  name: "Daily volume above the projected share of expected monthly volume",
  alertType: "A",
  grain: "client_day",
  condition: "day_volume * 100.0 > p.projected_pct * client.expected_monthly_volume",
  variables: [
    {
      name: "day_volume",
      agg: "sum",
      field: "amount",
      filter: "true",
      window: { kind: "day" },
    },
  ],
  params: { projected_pct: { value: 25, unit: "percent" } },
  explanation:
    "Flags when the client's total transaction volume for the day is more than 25% of their expected monthly volume.",
};

export const B2: RuleVersion = {
  ...base,
  id: 5,
  key: "B2",
  version: 1,
  name: "PEP outgoing payment above the limit",
  alertType: "B",
  grain: "transaction",
  condition: b2Condition,
  params: { pep_min: { value: 100_000, unit: "amount" } },
  explanation:
    "Flags outgoing or unknown-direction transactions of more than 100,000 CZK when the client is a politically exposed person.",
};

export const C1_V2: RuleVersion = {
  ...base,
  id: 7,
  key: "C1",
  version: 2,
  name: "Flow-through: inflow forwarded within hours",
  alertType: "C",
  grain: "client_anchor",
  anchor: 'tx.direction == "in"',
  condition: c1Condition,
  variables: c1Variables('tx.direction in ["out", "unknown"] && !(tx.payee_account in payers)'),
  params: {
    forward_pct: { value: 80, unit: "percent" },
    min_inflow: { value: 100_000, unit: "amount" },
  },
  explanation:
    "Flags when the client receives more than 100,000 CZK in incoming payments within 24 hours, and then forwards at least 80% of that amount within 6 hours.",
};

export const C1_V1: RuleVersion = {
  ...base,
  id: 6,
  key: "C1",
  version: 1,
  name: "Flow-through: inflow forwarded within hours",
  status: "retired",
  alertType: "C",
  grain: "client_anchor",
  anchor: 'tx.direction == "in"',
  condition: c1Condition,
  variables: c1Variables('tx.direction == "out" && !(tx.payee_account in payers)'),
  params: {
    forward_pct: { value: 80, unit: "percent" },
    min_inflow: { value: 100_000, unit: "amount" },
  },
  explanation: null,
  explanationModel: null,
};

export const SEEDED: RuleVersion[] = [A1, B2, C1_V2, C1_V1];

export const B2_V2: RuleVersion = {
  ...B2,
  id: 12,
  version: 2,
  status: "draft",
  author: "J. Novák",
  createdAt: "2026-10-19T21:30:00+02:00",
  params: { pep_min: { value: 50_000, unit: "amount" } },
  explanation:
    "Flags outgoing or unknown-direction transactions of more than 50,000 CZK when the client is a politically exposed person.",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
