import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { BacktestView } from "../BacktestView";
import { RulesPage } from "../RulesPage";
import { B2_V2, json, SEEDED } from "./fixtures";

// Unmount first: a component left mounted would otherwise fetch for real once `fetch` is restored.
beforeEach(() => {
  // The rows table loads more as its end comes into view; jsdom has no layout to tell.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Answers by method and path; the rules list by default. */
const engine = (routes: Record<string, (url: URL) => Response>) => {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url, "http://test");
    const route = routes[`${init?.method ?? "GET"} ${parsed.pathname}`];
    return route ? route(parsed) : json([...SEEDED, B2_V2]);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

const openDraft = async () => {
  const nav = await screen.findByRole("navigation", { name: "Rules" });
  fireEvent.click(within(nav).getByRole("button", { name: /B2/ }));
  fireEvent.click(await screen.findByRole("tab", { name: /v2/ }));
};

const SUMMARY = {
  ruleKey: "B2",
  ruleName: "PEP outgoing payment above the limit",
  draftId: 12,
  draftVersion: 2,
  activeVersion: 1,
  from: "2026-07-01",
  to: "2026-07-31",
  status: "DONE",
  error: null,
  transactions: 397_853,
  newCount: 1,
  droppedCount: 1,
  changedCount: 0,
  unchangedCount: 1,
  createdAt: "2026-10-20T09:14:00Z",
};

const ROWS = [
  {
    id: "T2",
    clientId: "K1",
    amount: 50_000,
    ts: "2026-07-11T09:00:00",
    before: null,
    after: "Medium",
    change: "NEW",
    note: "not flagged with the active rules",
  },
  {
    id: "T3",
    clientId: "K2",
    amount: 90_000,
    ts: "2026-07-12T09:00:00",
    before: "Low",
    after: null,
    change: "DROPPED",
    note: "B2 no longer fires",
  },
  {
    id: "T1",
    clientId: "K1",
    amount: 150_000,
    ts: "2026-07-10T09:00:00",
    before: "High",
    after: "High",
    change: "UNCHANGED",
    note: null,
  },
];

/** The engine's rows endpoint: filters by `view` and pages like the real one. */
const rows = (url: URL) => {
  const view = url.searchParams.get("view") ?? "all";
  const kept = ROWS.filter(
    (r) =>
      view === "all" ||
      (view === "changed" ? r.change !== "UNCHANGED" : r.change === view.toUpperCase()),
  );
  return json({ items: kept, page: 0, size: 100, total: kept.length });
};

describe("a draft's delete and backtest", () => {
  it("deletes a draft after confirming, and the active version stays", async () => {
    const fetch = engine({ "DELETE /api/rules/12": () => new Response(null, { status: 204 }) });
    render(<RulesPage author="J. Novák" user={null} users={[]} onBacktest={() => {}} />);
    await openDraft();
    expect(screen.queryByRole("button", { name: /New version from/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", { name: "Delete draft B2 v2" });
    expect(dialog).toHaveTextContent("v1 stays active");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete draft" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/rules/12",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("picks a period, starts the backtest and opens it", async () => {
    const fetch = engine({
      "POST /api/rules/12/backtest": () => json({ ...SUMMARY, status: "RUNNING" }, 202),
    });
    const onBacktest = vi.fn();
    render(<RulesPage author="J. Novák" user={null} users={[]} onBacktest={onBacktest} />);
    await openDraft();
    fireEvent.click(screen.getByRole("button", { name: "Backtest" }));

    const dialog = screen.getByRole("dialog", { name: "Backtest B2 v2" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Last 7 days" }));
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "2026-07-20" } });
    expect(within(dialog).getByText("Start is after end")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Run backtest →" })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "2026-07-14" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Run backtest →" }));
    await waitFor(() =>
      expect(onBacktest).toHaveBeenCalledWith(expect.objectContaining({ id: 12 })),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/rules/12/backtest?from=2026-07-14&to=2026-07-20",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the reason when the engine will not start the backtest", async () => {
    engine({
      "POST /api/rules/12/backtest": () => json({ detail: "only a draft can be backtested" }, 400),
    });
    const onBacktest = vi.fn();
    render(<RulesPage author="J. Novák" user={null} users={[]} onBacktest={onBacktest} />);
    await openDraft();
    fireEvent.click(screen.getByRole("button", { name: "Backtest" }));
    const dialog = screen.getByRole("dialog", { name: "Backtest B2 v2" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Run backtest →" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "only a draft can be backtested",
    );
    expect(onBacktest).not.toHaveBeenCalled();
  });

  it("shows the stored backtest, filters the rows on the engine and opens a transaction", async () => {
    const fetch = engine({
      "GET /api/rules/12/backtest": () => json(SUMMARY),
      "GET /api/rules/12/backtest/rows": rows,
    });
    const onOpen = vi.fn();
    render(<BacktestView draftId={12} onOpen={onOpen} />);

    expect(await screen.findByText("v1 active → v2 draft")).toBeInTheDocument();
    expect(screen.getByText("397,853 transactions replayed", { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));

    fireEvent.click(screen.getByRole("tab", { name: /Dropped/ }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(String(fetch.mock.lastCall?.[0])).toBe(
      "/api/rules/12/backtest/rows?view=dropped&page=0&size=100",
    );
    expect(screen.getByText("B2 no longer fires", { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByText("T3"));
    expect(onOpen).toHaveBeenCalledWith("T3", false);
  });

  it("waits while the engine runs the backtest, then shows it", async () => {
    let polls = 0;
    engine({
      "GET /api/rules/12/backtest": () =>
        json(++polls < 2 ? { ...SUMMARY, status: "RUNNING", from: "2026-07-25" } : SUMMARY),
      "GET /api/rules/12/backtest/rows": rows,
    });
    render(<BacktestView draftId={12} onOpen={() => {}} />);
    expect(await screen.findByRole("status")).toHaveTextContent("Replaying 7 days");
    expect(
      await screen.findByText("v1 active → v2 draft", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(polls).toBe(2);
  });

  it("says when a draft has no backtest", async () => {
    engine({ "GET /api/rules/12/backtest": () => json({ detail: "none" }, 404) });
    render(<BacktestView draftId={12} onOpen={() => {}} />);
    expect(
      await screen.findByText("This draft has no backtest.", { exact: false }),
    ).toBeInTheDocument();
  });

  it("shows a failed backtest with its reason", async () => {
    engine({
      "GET /api/rules/12/backtest": () =>
        json({ ...SUMMARY, status: "FAILED", error: "the engine stopped during the backtest" }),
    });
    render(<BacktestView draftId={12} onOpen={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "the engine stopped during the backtest",
    );
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
