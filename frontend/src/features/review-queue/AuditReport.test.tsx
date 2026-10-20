import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { AuditReport } from "./AuditReport";

import type { HistoryTransaction, TransactionDetail } from "./api";

const tx = (id: string, ts: string, amount: number): HistoryTransaction => ({
  id,
  ts,
  direction: "in",
  counterpartyAccount: `ACC-${id}`,
  counterpartyCountry: "SK",
  amount,
  alertTypes: [],
});

const detail: TransactionDetail = {
  transaction: {
    id: "T1",
    clientId: "K1",
    ts: "2026-07-01T19:42:53",
    amount: 197_918.56,
    volume: 197_918.56,
    currency: "CZK",
    fxRate: 1,
    direction: "in",
    type: "incoming payment",
    payerAccount: "ACC-T1",
    payerCountry: "SK",
    payeeAccount: "K1",
    payeeCountry: "CZ",
  },
  client: {
    id: "K1",
    country: "CZ",
    contractDate: "2022-02-11",
    channel: "distant form",
    pep: false,
    type: "natural person",
    risk: "medium",
    expectedMonthly: 50_000,
    expectedCount: 10,
    q2Volume: 0,
    q2TxCount: 0,
    q2MaxTx: 0,
    q2Days: 91,
  },
  rating: "High",
  disposition: "ESCALATE",
  status: "ESCALATED",
  assignee: null,
  log: [
    {
      at: "2026-10-20T09:00:00Z",
      action: "ESCALATED",
      actor: "J. Novák",
      reason: "Unusual inflow.",
      assignee: "M. Svobodová",
    },
    {
      at: "2026-10-20T08:00:00Z",
      action: "ASSIGNED",
      actor: null,
      reason: null,
      assignee: "J. Novák",
    },
  ],
  alerts: [
    {
      id: 7,
      alertType: "C",
      createdAt: "2026-10-20T08:07:13Z",
      status: "ESCALATED",
      rating: "High",
      triage: {
        disposition: "ESCALATE",
        score: 90,
        reasons: [{ code: "R1", description: "amount above declared monthly", points: 40 }],
        configVersion: "3",
        decidedAt: null,
      },
      hits: [
        {
          rule: "C1",
          name: "Big inflow",
          version: 4,
          grainKey: "T1",
          evidence: { inflow: 197_918.56, "p.min_inflow": 100_000 },
        },
      ],
    },
  ],
  day: [tx("T1", "2026-07-01T19:42:53", 197_918.56)],
  historyCount: 3,
};

const c1 = {
  key: "C1",
  version: 4,
  name: "Big inflow",
  grain: "client_anchor",
  condition: "inflow > p.min_inflow",
  variables: [
    {
      name: "inflow",
      agg: "sum",
      field: "amount",
      window: { kind: "relative", from: "PT-24H", to: "PT0S" },
    },
  ],
  params: { min_inflow: { value: 100_000, unit: "amount" } },
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "http://test");
      if (url.pathname === "/api/rules") return json([c1]);
      if (url.pathname.endsWith("/assessment")) return new Response(null, { status: 404 });
      const older = url.searchParams.get("direction") === "older";
      return json({
        items: older
          ? [tx("IN-WINDOW", "2026-07-01T08:00:00", 1), tx("OLD", "2026-06-01T08:00:00", 2)]
          : [],
        more: false,
      });
    }),
  );
});

const audit = () => screen.findByRole("article", { name: "Audit trail" });

describe("AuditReport", () => {
  it("names who acted on the case, the log oldest first", async () => {
    render(<AuditReport detail={detail} onClose={() => {}} />);
    const rows = (await screen.findAllByRole("row")).map((r) => r.textContent ?? "");
    const assigned = rows.findIndex((r) => r.includes("přidělen") && r.includes("systém"));
    const escalated = rows.findIndex((r) => r.includes("J. NovákM. SvobodováUnusual inflow."));
    expect(assigned).toBeGreaterThan(-1);
    expect(escalated).toBeGreaterThan(assigned);
  });

  it("shows each fired rule with its condition, inputs and thresholds", async () => {
    render(<AuditReport detail={detail} onClose={() => {}} />);
    const article = await audit();
    expect(article).toHaveTextContent("Pravidlo C1 verze 4 „Big inflow“");
    expect(article).toHaveTextContent("inflow > p.min_inflow");
    expect(article).toHaveTextContent(/inflow: součet částek v okně od 24 h před obchodem T1/);
    expect(article).toHaveTextContent("práh min_inflow: 100 000,00 CZK");
  });

  it("gives the triage score, routing, config version and every reason with its points", async () => {
    render(<AuditReport detail={detail} onClose={() => {}} />);
    const article = await audit();
    expect(article).toHaveTextContent("Skóre triáže90 / 100");
    expect(article).toHaveTextContent("Směrováníeskalovat");
    expect(article).toHaveTextContent("Verze nastavení triáže3");
    expect(article).toHaveTextContent("R1amount above declared monthly40");
  });

  it("lists the client's transactions inside the rule window but not those outside it", async () => {
    render(<AuditReport detail={detail} onClose={() => {}} />);
    const article = await audit();
    expect(article).toHaveTextContent("IN-WINDOW");
    expect(article).not.toHaveTextContent("OLD");
  });

  it("says the AI assessment never ran rather than generating one", async () => {
    render(<AuditReport detail={detail} onClose={() => {}} />);
    expect(await audit()).toHaveTextContent("Výstraha #7: AI posouzení neproběhlo.");
    const calls = vi.mocked(fetch).mock.calls as unknown as [string, RequestInit?][];
    expect(calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});
