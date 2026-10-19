import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
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
  status: "NEW",
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
  status: "NEW",
  alerts: [
    {
      id: 7,
      alertType: "B",
      createdAt: new Date().toISOString(),
      status: "NEW",
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
  historyCount: 1,
  day: [
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

/** The engine's GET endpoints the app calls, by path. */
const routes: Record<string, (url: URL) => unknown> = {
  "/api/transactions": (url) => {
    const page = Number(url.searchParams.get("page"));
    return {
      items: pages[page] ?? [],
      page,
      size: 50,
      total: 3,
      countsByRating: { High: 1, Medium: 1, Low: 1 },
    };
  },
  "/api/transactions/TX1": () => ({ ...detail, status: detailStatus }),
  "/api/rules": () => [],
  "/api/users": () => users,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let observers: IntersectionObserverCallback[] = [];

/** TX1's client has OLD1…OLD7 before it and nothing after: five, then the last two. */
const older = Array.from({ length: 7 }, (_, i) => ({
  id: `OLD${i + 1}`,
  ts: `2026-07-0${7 - i}T10:00:00`,
  direction: "in",
  counterpartyAccount: "ACZ00001",
  counterpartyCountry: "CZ",
  amount: 1_000,
  alertTypes: [],
}));
const history = (url: URL) => {
  if (url.searchParams.get("direction") === "newer") return { items: [], more: false };
  const from = url.pathname.includes("/TX1/")
    ? 0
    : older.findIndex((h) => url.pathname.includes(`/${h.id}/`)) + 1;
  return { items: older.slice(from, from + 5), more: from + 5 < older.length };
};
/** The case status the engine reports for TX1. */
let detailStatus = "NEW";

beforeEach(() => {
  observers = [];
  detailStatus = "NEW";
  // Node's own experimental localStorage shadows happy-dom's and throws without a backing file.
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
  });
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
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, "http://test");
      if (init?.method === "PUT" && url.pathname === "/api/transactions/TX1/status") {
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith("/history")) return json(history(url));
      const route = routes[url.pathname];
      return route ? json(route(url)) : json({ message: "not found" }, 404);
    }),
  );
});

// Unmount first: a component left mounted would otherwise fetch for real once `fetch` is restored.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const users = [
  { id: 1, name: "J. Novák", role: "REVIEWER" },
  { id: 2, name: "M. Svobodová", role: "MANAGER" },
];

/** Opens the avatar menu and signs in as `name`, once the users have loaded. */
const switchUser = async (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Switch user" }));
  const select = screen.getByRole("combobox", { name: "Signed in as" });
  await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(2));
  const id = users.find((u) => u.name === name)?.id;
  fireEvent.change(select, { target: { value: String(id) } });
};

/** The latest request for a queue page. */
const lastQueueCall = () =>
  vi.mocked(fetch).mock.calls.findLast(([u]) => String(u).startsWith("/api/transactions?"));

// Role queries skip hidden detail tabs, so this is always the visible table.
const queueTable = () => screen.getByRole("table");

describe("App", () => {
  it("loads the role's statuses from the engine and offers only those", async () => {
    render(<App />);
    const lastStatus = () =>
      new URL(String(lastQueueCall()?.[0]), "http://test").searchParams.get("status");
    await waitFor(() => expect(lastStatus()).toBe("NEW,FALSE_POSITIVE"));
    const status = screen.getByRole("combobox", { name: "Status" });
    expect(within(status).queryByRole("option", { name: "Escalated" })).not.toBeInTheDocument();

    fireEvent.change(status, { target: { value: "False Positive" } });
    await waitFor(() => expect(lastStatus()).toBe("FALSE_POSITIVE"));

    await switchUser("M. Svobodová");
    await waitFor(() => expect(lastStatus()).toBe("ESCALATED,REPORTED"));
    expect(within(status).getByRole("option", { name: "Reported" })).toBeInTheDocument();
    expect(within(status).queryByRole("option", { name: "New" })).not.toBeInTheDocument();
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

  it("switches the user from the avatar, shows their name and sends them with every call", async () => {
    render(<App />);
    expect(await screen.findByText("J. Novák")).toBeInTheDocument();
    await switchUser("M. Svobodová");
    expect(screen.getByText("M. Svobodová")).toBeInTheDocument();
    await waitFor(() =>
      expect(lastQueueCall()?.[1]).toMatchObject({ headers: { "X-User-Id": "2" } }),
    );
  });

  it("remembers the chosen user across a reload", async () => {
    const { unmount } = render(<App />);
    await switchUser("M. Svobodová");
    expect(JSON.parse(localStorage.getItem("aml.user") ?? "null")).toMatchObject({ id: 2 });
    unmount();

    render(<App />);
    expect(screen.getByText("M. Svobodová")).toBeInTheDocument();
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
    expect(
      await screen.findByText("Supplier payment, invoice on file.", { selector: "span" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Review queue/ }));
    expect(within(queueTable()).getByText("TX1").closest("tr")).toHaveTextContent("False Positive");
    expect(screen.getByTitle("Open cases by rule rating")).toHaveTextContent("0 High");
  });

  it("pins an escalation on the engine before recording it, and keeps the case open if that fails", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    fireEvent.click(await screen.findByRole("button", { name: "Escalate" }));
    fireEvent.change(screen.getByPlaceholderText("What needs further investigation and why"), {
      target: { value: "Funds forwarded abroad the same day." },
    });

    const put = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: "Escalate transaction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 500");
    expect(
      screen.queryByText("Funds forwarded abroad the same day.", { selector: "span" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Escalate transaction" }));
    expect(
      await screen.findByText("Funds forwarded abroad the same day.", { selector: "span" }),
    ).toBeInTheDocument();
    expect(put()).toHaveLength(2);
    expect(put()[1]?.[1]).toMatchObject({ body: JSON.stringify({ status: "ESCALATED" }) });
  });

  it("offers false positive or report on an escalated case, and only a manager reports", async () => {
    detailStatus = "ESCALATED";
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    const report = await screen.findByRole("button", { name: "Report" });
    expect(screen.queryByRole("button", { name: "Escalate" })).not.toBeInTheDocument();
    expect(report).toBeDisabled();

    await switchUser("M. Svobodová");
    expect(report).toBeEnabled();
    fireEvent.click(report);
    fireEvent.change(screen.getByPlaceholderText("Why the transaction is reported as suspicious"), {
      target: { value: "Pattern matches layering." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Report transaction" }));
    expect(
      await screen.findByText("Pattern matches layering.", { selector: "span" }),
    ).toBeInTheDocument();
    const lastPut = vi
      .mocked(fetch)
      .mock.calls.findLast(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(lastPut?.[1]).toMatchObject({ body: JSON.stringify({ status: "REPORTED" }) });
  });

  it("shows five of the client's transactions before this one and loads five more on request", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    expect(await screen.findByText("OLD5")).toBeInTheDocument();
    expect(screen.queryByText("OLD6")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show 5 newer" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show 5 older" }));
    expect(await screen.findByText("OLD7")).toBeInTheDocument();
    expect(String(vi.mocked(fetch).mock.lastCall?.[0])).toContain("/api/transactions/OLD5/history");
    expect(screen.queryByRole("button", { name: "Show 5 older" })).not.toBeInTheDocument();
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
