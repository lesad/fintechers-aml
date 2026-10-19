import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { App } from "./App";

const row = (id: string, rating: string, rules: string[], clientId = "K1") => ({
  id,
  clientId,
  ts: "2026-07-17T15:58:00",
  amount: 184_500,
  volume: 7352,
  currency: "EUR",
  direction: "out",
  alertTypes: [rules[0]?.charAt(0) ?? "A"],
  rules: rules.map((key) => ({ key, name: `Rule ${key}` })),
  rating,
  disposition:
    rating === "High" ? "REVIEW_HIGH" : rating === "Medium" ? "REVIEW_MEDIUM" : "REVIEW_LOW",
  score: rating === "High" ? 80 : rating === "Medium" ? 50 : 20,
  flaggedAt: new Date().toISOString(),
});

const detail = {
  transaction: {
    id: "TX1",
    clientId: "K1",
    ts: "2026-07-17T15:58:00",
    amount: 184_500,
    volume: 7352,
    currency: "EUR",
    fxRate: 25.095,
    direction: "out",
    type: "outgoing payment",
    payerAccount: "K1",
    payerCountry: "CZ",
    payeeAccount: "AAT00116",
    payeeCountry: "AT",
  },
  client: {
    id: "K1",
    country: "CZ",
    contractDate: "2019-03-14",
    channel: "in person",
    pep: true,
    type: "legal entity",
    risk: "high",
    expectedMonthly: 400_000,
    expectedCount: 55,
    q2Volume: 1_620_000,
    q2TxCount: 182,
    q2MaxTx: 61_400,
    q2Days: 91,
  },
  rating: "High",
  disposition: "ESCALATE",
  alerts: [
    {
      id: 7,
      alertType: "B",
      createdAt: new Date().toISOString(),
      triage: {
        disposition: "ESCALATE",
        score: 95,
        reasons: [
          { code: "RULE_BASE", description: "base score for B2", points: 60 },
          { code: "CLIENT_PEP", description: "client is a PEP", points: 35 },
          { code: "PRIOR_REPORTS", description: "0 earlier filing(s) for this client", points: 0 },
        ],
        configVersion: "triage-v1",
        decidedAt: null,
      },
      hits: [
        {
          rule: "B2",
          name: "PEP outgoing payment above the limit",
          version: 1,
          grainKey: "TX1",
          evidence: { "tx.amount": 184_500, "p.pep_min": 100_000 },
        },
      ],
    },
  ],
  history: [
    {
      id: "TX1",
      ts: "2026-07-17T15:58:00",
      direction: "out",
      counterpartyAccount: "AAT00116",
      counterpartyCountry: "AT",
      amount: 184_500,
      alertTypes: ["B"],
    },
  ],
};

const pages = [
  [row("TX1", "High", ["B2"]), row("TX2", "Medium", ["A1"], "K2")],
  [row("TX3", "Low", ["A1"], "K3")],
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let observers: IntersectionObserverCallback[] = [];

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        observers.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "http://test");
      if (url.pathname === "/api/transactions") {
        const page = Number(url.searchParams.get("page"));
        return json({
          items: pages[page] ?? [],
          page,
          size: 50,
          total: 3,
          countsByRating: { High: 1, Medium: 1, Low: 1 },
        });
      }
      if (url.pathname === "/api/transactions/TX1") return json(detail);
      if (url.pathname === "/api/rules") return json([]);
      return json({ message: "not found" }, 404);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

// Role queries skip hidden detail tabs, so this is always the visible table.
const queueTable = () => screen.getByRole("table");

describe("App", () => {
  it("filters by status on the engine, not in the browser", async () => {
    render(<App />);
    await waitFor(() => expect(within(queueTable()).getAllByRole("row")).toHaveLength(3));
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "Escalated" },
    });
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenLastCalledWith(
        expect.stringContaining("status=ESCALATED"),
        expect.anything(),
      ),
    );
  });

  it("loads the queue from the engine and the next page when the list end comes into view", async () => {
    render(<App />);
    await waitFor(() => expect(within(queueTable()).getAllByRole("row")).toHaveLength(3));
    expect(screen.getByText("2 of 3 loaded")).toBeInTheDocument();

    act(() =>
      observers.at(-1)?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    await waitFor(() => expect(within(queueTable()).getAllByRole("row")).toHaveLength(4));
    expect(screen.getByText("3 of 3 loaded")).toBeInTheDocument();
  });

  it("the cog opens the rules page and again returns to the queue with tabs intact", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    const cog = screen.getByRole("button", { name: "Rules" });
    expect(cog).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(cog);
    expect(cog).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();

    fireEvent.click(cog);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("TX1");
  });

  it("opens a row as a detail tab with the rule's parameters as stored", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));

    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("TX1");
    expect(await screen.findByText("p.pep_min 100000")).toBeInTheDocument();
    expect(screen.getByText("95", { selector: "b" })).toBeInTheDocument();
    expect(screen.queryByText("client is a PEP")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Breakdown" }));
    const breakdown = screen.getByRole("dialog", { name: "Triage score breakdown" });
    expect(within(breakdown).getByText("client is a PEP")).toBeInTheDocument();
    expect(within(breakdown).getByText("+35")).toBeInTheDocument();
    expect(
      within(breakdown).queryByText("0 earlier filing(s) for this client"),
    ).not.toBeInTheDocument();
    expect(within(breakdown).getByText("Not connected")).toBeInTheDocument();
    fireEvent.click(within(breakdown).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close tab" }));
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Review queue");
  });

  it("needs a reason before closing a case, then shows it in the queue and the counts", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));

    fireEvent.click(await screen.findByRole("button", { name: "False positive" }));
    const submit = screen.getByRole("button", { name: "Mark as false positive" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Why the transaction is not suspicious"), {
      target: { value: "Supplier payment, invoice on file." },
    });
    fireEvent.click(submit);
    expect(screen.getByText("Supplier payment, invoice on file.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Review queue/ }));
    expect(within(queueTable()).getByText("TX1").closest("tr")).toHaveTextContent("False Positive");
    expect(screen.getByTitle("Open cases by rule rating")).toHaveTextContent("0 High");
  });

  it("opens a transaction typed into the header and flags unknown ids", async () => {
    render(<App />);
    const jump = screen.getByRole("textbox", { name: "Open transaction by ID" });

    fireEvent.change(jump, { target: { value: "tx999" } });
    fireEvent.submit(jump);
    expect(await screen.findByText("Not found")).toBeInTheDocument();

    fireEvent.change(jump, { target: { value: "tx1" } });
    fireEvent.submit(jump);
    await waitFor(() =>
      expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("TX1"),
    );
  });
});
