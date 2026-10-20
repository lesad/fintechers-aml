import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { OpoReport } from "./OpoReport";

import type { HistoryTransaction, TransactionDetail } from "./api";

const day = (
  id: string,
  ts: string,
  direction: HistoryTransaction["direction"],
  amount: number,
): HistoryTransaction => ({
  id,
  ts,
  direction,
  counterpartyAccount: `ACC-${id}`,
  counterpartyCountry: "SK",
  amount,
  alertTypes: ["C"],
});

const reported = day("T1", "2026-07-01T19:42:53", "in", 197_918.56);

const detail: TransactionDetail = {
  transaction: {
    id: "T1",
    clientId: "K1",
    ts: "2026-07-01T19:42:53",
    amount: 197_918.56,
    volume: 8_161.59,
    currency: "EUR",
    fxRate: 24.25,
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
    expectedMonthly: 287_735.23,
    expectedCount: 10,
    q2Volume: 0,
    q2TxCount: 0,
    q2MaxTx: 0,
    q2Days: 91,
  },
  rating: "High",
  disposition: "ESCALATE",
  status: "REPORTED",
  assignee: null,
  log: [
    {
      at: "2026-10-20T09:00:00Z",
      action: "REPORTED",
      actor: "M. Svobodová",
      reason: "Příjem ze Slovenska přeposlán do 6 hodin na cizí účty.",
      assignee: null,
      postponed: true,
    },
    {
      at: "2026-10-20T08:00:00Z",
      action: "ESCALATED",
      actor: "J. Novák",
      reason: "Unusual outflow.",
      assignee: "M. Svobodová",
    },
  ],
  alerts: [
    {
      id: 7,
      alertType: "C",
      createdAt: "2026-10-20T08:07:13Z",
      status: "REPORTED",
      rating: "High",
      triage: {
        disposition: "ESCALATE",
        score: 90,
        reasons: [{ code: "R1", description: "client is not a PEP", points: 0 }],
        configVersion: "1",
        decidedAt: null,
      },
      hits: [
        {
          rule: "C1",
          name: "Flow-through",
          version: 4,
          grainKey: "ANCHOR",
          evidence: { inflow: 202_856.29, "p.forward_pct": 80 },
        },
        { rule: "C1", name: "Flow-through", version: 4, grainKey: "ELSEWHERE", evidence: {} },
      ],
    },
  ],
  day: [reported],
  historyCount: 4,
};

const c1 = {
  key: "C1",
  version: 4,
  name: "Flow-through",
  grain: "client_anchor",
  condition: "inflow > p.min_inflow",
  variables: [
    {
      name: "inflow",
      agg: "sum",
      field: "amount",
      window: { kind: "relative", from: "PT-24H", to: "PT0S" },
    },
    {
      name: "outflow",
      agg: "sum",
      field: "amount",
      window: { kind: "relative", from: "PT0S", to: "PT6H" },
    },
  ],
  params: { forward_pct: { value: 80, unit: "percent" } },
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "http://test");
      if (url.pathname === "/api/rules") return json([c1]);
      const older = url.searchParams.get("direction") === "older";
      return json({
        items: older
          ? [day("BEFORE", "2026-06-30T08:00:00", "out", 1)]
          : [
              day("LATE", "2026-07-03T08:00:00", "out", 2),
              day("REMIT", "2026-07-02T15:03:05", "unknown", 710_505.57),
              day("ANCHOR", "2026-07-02T10:13:26", "in", 4_937.73),
            ],
        more: false,
      });
    }),
  );
});

const report = () => screen.findByRole("article", { name: "FAÚ report" });

describe("OpoReport", () => {
  it("never names the employee who detected or escalated the case (§ 18(3))", async () => {
    render(<OpoReport detail={detail} onClose={() => {}} />);
    expect(await report()).not.toHaveTextContent("J. Novák");
    expect(await report()).not.toHaveTextContent("Unusual outflow.");
  });

  it("names the reporting manager as the person filing and quotes the report's reason", async () => {
    render(<OpoReport detail={detail} onClose={() => {}} />);
    expect(await report()).toHaveTextContent("Jméno a příjmeníM. Svobodová");
    expect(await report()).toHaveTextContent("Příjem ze Slovenska přeposlán do 6 hodin");
  });

  it("marks a natural person's identity, which the dataset lacks, as missing data", async () => {
    render(<OpoReport detail={detail} onClose={() => {}} />);
    await report();
    const missing = screen.getAllByTestId("missing").map((m) => m.textContent);
    expect(missing).toEqual(
      expect.arrayContaining([
        "chybí v datech: jméno a příjmení",
        "chybí v datech: rodné číslo nebo datum narození",
        "chybí v datech: údaje dokladu totožnosti",
        "chybí v datech: účel platby",
      ]),
    );
    expect(missing).not.toContain("chybí v datech: IČO");
  });

  it("gives the grounds only from the hit whose window holds the transaction, the other under further information", async () => {
    render(<OpoReport detail={detail} onClose={() => {}} />);
    const article = await report();
    expect(article).toHaveTextContent("Pravidlo C1 verze 4");
    expect(article).toHaveTextContent(/inflow: součet částek v okně od 24 h před obchodem ANCHOR/);
    expect(article).toHaveTextContent("C1 „Flow-through“ (ELSEWHERE)");
    expect(article).not.toHaveTextContent("client is not a PEP");
  });

  it("lists the client's transactions in the rule's window, the remittance among them", async () => {
    render(<OpoReport detail={detail} onClose={() => {}} />);
    const rows = (await screen.findAllByRole("row")).map((r) => r.textContent ?? "");
    expect(rows.slice(1).map((r) => r.match(/T1|ANCHOR|REMIT|BEFORE|LATE/)?.[0])).toEqual([
      "T1",
      "ANCHOR",
      "REMIT",
    ]);
    expect(rows[3]).toContain("remitence");
  });

  it("states the § 20 postponement, and shows it as missing on a report saved without one", async () => {
    const { unmount } = render(<OpoReport detail={detail} onClose={() => {}} />);
    expect(await report()).toHaveTextContent(
      "Odložen: příkaz bude proveden nejdříve 24 hodin po přijetí oznámení Úřadem",
    );
    unmount();

    const [filed, ...rest] = detail.log;
    const older = { ...detail, log: [{ ...filed!, postponed: null }, ...rest] };
    render(<OpoReport detail={older} onClose={() => {}} />);
    expect(await report()).toHaveTextContent("chybí v datech: rozhodnutí o provedení či odkladu");
  });
});
