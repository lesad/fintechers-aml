import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { useNavigate } from "react-router";
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
  "/api/transactions/TX1": () => ({ ...detail, status: detailStatus, assignee, log }),
  "/api/rules": () => [],
  "/api/users": () => users,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const noSuggestion = {
  kind: "none",
  explanation: [{ text: "A one-off payment is not a pattern a rule can cover.", refs: ["reason"] }],
  rule: null,
  previousParams: null,
  retires: null,
  ruleExplanation: null,
  impact: null,
  declined: null,
};

const ruleSuggestion = {
  ...noSuggestion,
  kind: "rule_version",
  explanation: [{ text: "The client pays this supplier every month.", refs: ["reason"] }],
  rule: {
    key: "B2-K1",
    version: 1,
    name: "PEP outgoing payment above the limit (client K1)",
    alertType: "B",
    layer: "client",
    scopeSegmentId: null,
    scopeClientId: "K1",
    grain: "transaction",
    anchor: null,
    condition: 'client.pep && tx.amount > p.pep_min && tx.payee_account != "ACZ00000"',
    replacesKey: "B2",
    variables: [],
    params: { pep_min: { value: 50_000, unit: "amount" } },
  },
  previousParams: { pep_min: { value: 50_000, unit: "amount" } },
  ruleExplanation:
    "Flags outgoing payments above CZK 50,000 by this PEP client, except to the supplier.",
};

let suggestionReply: unknown = noSuggestion;
let observers: IntersectionObserverCallback[] = [];

/** TX1's client has OLD1…OLD7 before it, newest first, and nothing after. */
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
  const limit = Number(url.searchParams.get("limit"));
  return { items: older.slice(from, from + limit), more: from + limit < older.length };
};
/** The case status the engine reports for TX1. */
let detailStatus = "NEW";
let assignee: (typeof users)[number] | null = null;
let log: {
  at: string;
  action: string;
  actor: string | null;
  reason: string | null;
  assignee: string | null;
}[] = [];

/** A fake engine: a decision or a reassignment changes the case and lands in its log. */
function fakeEnginePut(init: RequestInit) {
  const body = JSON.parse(String(init.body)) as {
    status?: string;
    reason?: string;
    userId?: number;
  };
  const actor = users.find((u) => String(u.id) === new Headers(init.headers).get("X-User-Id"));
  if (body.userId !== undefined) assignee = users.find((u) => u.id === body.userId) ?? null;
  else if (body.status === "ESCALATED") assignee = users[1] ?? null;
  if (body.status) detailStatus = body.status;
  log.unshift({
    at: "2026-10-19T11:42:10+02:00",
    action: body.status ?? "REASSIGNED",
    actor: actor?.name ?? null,
    reason: body.reason ?? null,
    assignee: assignee?.name ?? null,
  });
  return new Response(null, { status: 204 });
}

beforeEach(() => {
  suggestionReply = noSuggestion;
  observers = [];
  detailStatus = "NEW";
  assignee = null;
  log = [];
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
      if (init?.method === "PUT" && url.pathname.startsWith("/api/transactions/TX1/")) {
        return fakeEnginePut(init);
      }
      if (url.pathname === "/api/alerts/7/suggestion") return json(suggestionReply);
      if (init?.method === "POST" && url.pathname === "/api/rules") {
        const body = JSON.parse(String(init.body));
        return json({
          ...body,
          id: 42,
          version: 1,
          status: "draft",
          createdAt: "2026-10-20T10:00:00Z",
          explanation: null,
          explanationModel: null,
        });
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
  const list = screen.getByRole("radiogroup", { name: "Signed in as" });
  await waitFor(() => expect(within(list).getAllByRole("radio")).toHaveLength(2));
  fireEvent.click(within(list).getByRole("radio", { name: new RegExp(name) }));
};

/** The latest request for a queue page. */
const lastQueueCall = () =>
  vi.mocked(fetch).mock.calls.findLast(([u]) => String(u).startsWith("/api/transactions?"));

// Role queries skip hidden detail tabs, so this is always the visible table.
const queueTable = () => screen.getByRole("table");

describe("App", () => {
  it("asks the engine for the signed-in user's cases only, in any status unless one is picked", async () => {
    render(<App />);
    const lastParams = () => new URL(String(lastQueueCall()?.[0]), "http://test").searchParams;
    await waitFor(() => expect(lastParams().get("assignee")).toBe("1"));
    expect(lastParams().has("status")).toBe(false);

    const status = screen.getByRole("combobox", { name: "Status" });
    fireEvent.change(status, { target: { value: "Escalated" } });
    await waitFor(() => expect(lastParams().get("status")).toBe("ESCALATED"));

    await switchUser("M. Svobodová");
    await waitFor(() => expect(lastParams().get("assignee")).toBe("2"));
    expect(lastParams().get("status")).toBe("ESCALATED");
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

  it("one click on the avatar lists every user, the signed-in one checked", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Switch user" }));
    const list = screen.getByRole("radiogroup", { name: "Signed in as" });
    await waitFor(() => expect(within(list).getAllByRole("radio")).toHaveLength(2));
    expect(within(list).getByRole("radio", { name: /J\. Novák/ })).toBeChecked();
    expect(within(list).getByRole("radio", { name: /M\. Svobodová · Manager/ })).not.toBeChecked();
  });

  it("closes the user panel on a click elsewhere or Escape, not on the avatar's own click", async () => {
    render(<App />);
    const avatar = screen.getByRole("button", { name: "Switch user" });
    fireEvent.click(avatar);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("radiogroup", { name: "Signed in as" })).not.toBeInTheDocument();

    fireEvent.pointerDown(avatar);
    fireEvent.click(avatar);
    expect(screen.getByRole("radiogroup", { name: "Signed in as" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("radiogroup", { name: "Signed in as" })).not.toBeInTheDocument();
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

  it("the logo goes to the review queue from the rules page or a transaction tab, tabs kept", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    fireEvent.click(screen.getByRole("button", { name: "Rules" }));
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "AML spotter" }));
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Review queue");
    expect(screen.getByRole("tab", { name: /TX1/ })).toBeInTheDocument();
  });

  it("puts the open transaction in the URL, so Back returns to the list and a reload reopens it", async () => {
    const Back = () => {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => void navigate(-1)}>
          Browser back
        </button>
      );
    };
    const { unmount } = render(
      <>
        <App />
        <Back />
      </>,
    );
    fireEvent.click(await screen.findByText("TX1"));
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("TX1");

    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Review queue");
    expect(screen.getByRole("tab", { name: /TX1/ })).toBeInTheDocument();
    unmount();

    render(<App />, { route: "/transactions/TX1" });
    expect(await screen.findByRole("tab", { selected: true })).toHaveTextContent("TX1");
  });

  it("opens the rules page straight from /rules and sends an unknown path back to the overview", async () => {
    const { unmount } = render(<App />, { route: "/rules" });
    expect(screen.getByRole("button", { name: "Rules" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    unmount();

    render(<App />, { route: "/nowhere" });
    expect(await screen.findByRole("tab", { name: /Review queue/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rules" })).toHaveAttribute("aria-pressed", "false");
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
    expect(within(breakdown).queryByText("Not connected")).not.toBeInTheDocument();
    fireEvent.click(within(breakdown).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close tab" }));
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Review queue");
  });

  it("needs a reason before closing a case, then reloads the queue from the engine", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));

    fireEvent.click(await screen.findByRole("button", { name: "False positive" }));
    const submit = screen.getByRole("button", { name: "Mark as false positive" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Why the transaction is not suspicious"), {
      target: { value: "Supplier payment, invoice on file." },
    });
    const queueLoads = () =>
      vi.mocked(fetch).mock.calls.filter(([u]) => String(u).startsWith("/api/transactions?"))
        .length;
    const before = queueLoads();
    fireEvent.click(submit);
    expect(
      await screen.findByText("Supplier payment, invoice on file.", { selector: "span" }),
    ).toBeInTheDocument();
    expect(queueLoads()).toBeGreaterThan(before);
    expect(screen.getByRole("status")).toHaveTextContent("Marked as false positive.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/alerts/7/suggestion",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "Supplier payment, invoice on file." }),
      }),
    );

    fireEvent.click(screen.getByRole("tab", { name: /Review queue/ }));
    expect(await within(queueTable()).findByText("TX1")).toBeInTheDocument();
    expect(within(queueTable()).getByText("TX1").closest("tr")).toHaveTextContent("False Positive");
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
    expect(put()[1]?.[1]).toMatchObject({
      body: JSON.stringify({ status: "ESCALATED", reason: "Funds forwarded abroad the same day." }),
    });
    expect(screen.getByText("M. Svobodová", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Decision log" })).toHaveTextContent(
      "Escalated → M. SvobodováJ. Novák · 2026-10-19 11:42",
    );
  });

  it("hands the case to the other user and logs who did it", async () => {
    assignee = users[0] ?? null;
    log = [
      {
        at: "2026-10-18T09:00:00+02:00",
        action: "ASSIGNED",
        actor: null,
        reason: null,
        assignee: "J. Novák",
      },
    ];
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    const entries = await screen.findByRole("list", { name: "Decision log" });
    expect(entries).toHaveTextContent("Assigned → J. NovákTriage · 2026-10-18 09:00");

    await waitFor(() => expect(screen.getByRole("button", { name: "Change" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("button", { name: /M\. Svobodová/ }));
    await waitFor(() =>
      expect(within(entries).getAllByRole("listitem")[0]).toHaveTextContent(
        "Reassigned → M. SvobodováJ. Novák",
      ),
    );
    expect(screen.getByText("Manager", { selector: "span" })).toBeInTheDocument();
  });

  it("offers no reassignment on a closed case", async () => {
    detailStatus = "REPORTED";
    assignee = users[1] ?? null;
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    expect(await screen.findByText("Manager", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
  });

  it("leaves an escalated case to the manager: no decision for a reviewer, false positive or report for a manager", async () => {
    detailStatus = "ESCALATED";
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    expect(await screen.findByText(/A manager decides now/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "False positive" })).not.toBeInTheDocument();

    await switchUser("M. Svobodová");
    expect(screen.getByRole("button", { name: "False positive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escalate" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
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
    expect(lastPut?.[1]).toMatchObject({
      body: JSON.stringify({ status: "REPORTED", reason: "Pattern matches layering." }),
    });
  });

  it("shows two of the client's transactions before this one, oldest first, and loads earlier ones above", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    const old2 = await screen.findByText("OLD2");
    expect(screen.queryByText("OLD3")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load later" })).not.toBeInTheDocument();
    const earlier = screen.getByRole("button", { name: "Load earlier" });
    const card = old2.closest("tbody");
    expect(card?.querySelector("tr")).toContainElement(earlier);
    expect(card?.textContent?.indexOf("OLD2")).toBeLessThan(
      card?.textContent?.indexOf("OLD1") ?? 0,
    );

    fireEvent.click(earlier);
    expect(await screen.findByText("OLD7")).toBeInTheDocument();
    const last = String(vi.mocked(fetch).mock.lastCall?.[0]);
    expect(last).toContain("/api/transactions/OLD2/history");
    expect(last).toContain("limit=10");
    expect(screen.queryByRole("button", { name: "Load earlier" })).not.toBeInTheDocument();
  });

  it("opens the rule suggestion when the engine proposes a change", async () => {
    suggestionReply = ruleSuggestion;
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    fireEvent.click(await screen.findByRole("button", { name: "False positive" }));
    fireEvent.change(screen.getByPlaceholderText("Why the transaction is not suspicious"), {
      target: { value: "Monthly supplier payment." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark as false positive" }));
    expect(screen.getByRole("button", { name: "Checking for a rule change…" })).toBeDisabled();

    const dialog = await screen.findByRole("dialog", { name: "Rule suggestion" });
    expect(within(dialog).getByText("Suggested rule change")).toBeInTheDocument();
    expect(screen.getByText("Monthly supplier payment.", { selector: "span" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("accepting the suggestion saves it as a draft by the current user and links to it", async () => {
    suggestionReply = ruleSuggestion;
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    fireEvent.click(await screen.findByRole("button", { name: "False positive" }));
    fireEvent.change(screen.getByPlaceholderText("Why the transaction is not suspicious"), {
      target: { value: "Monthly supplier payment." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark as false positive" }));
    const dialog = await screen.findByRole("dialog", { name: "Rule suggestion" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept" }));

    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent("Draft rule B2-K1 saved.");
    expect(within(toast).getByRole("link", { name: "Open in rules" })).toHaveAttribute(
      "href",
      "/rules?rule=42",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const post = vi
      .mocked(fetch)
      .mock.calls.find(([u, init]) => u === "/api/rules" && init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      key: "B2-K1",
      name: "PEP outgoing payment above the limit (client K1)",
      replacesKey: "B2",
      author: "J. Novák",
    });
  });

  it("still records the false positive when the suggestion fails", async () => {
    suggestionReply = { detail: "nope" };
    render(<App />);
    fireEvent.click(await screen.findByText("TX1"));
    fireEvent.click(await screen.findByRole("button", { name: "False positive" }));
    fireEvent.change(screen.getByPlaceholderText("Why the transaction is not suspicious"), {
      target: { value: "Fine." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark as false positive" }));

    expect(await screen.findByRole("status")).toHaveTextContent("The rule suggestion failed.");
    expect(screen.getByText("Fine.", { selector: "span" })).toBeInTheDocument();
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
