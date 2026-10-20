import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { ImportPage } from "./ImportPage";

const job = (over: Record<string, unknown> = {}) => ({
  id: 7,
  fileName: "tx_july.csv",
  fileSize: 2048,
  rule: null,
  by: "J. Novák",
  startedAt: "2026-10-20T09:14:00Z",
  finishedAt: null,
  stage: "VALIDATE",
  status: null,
  rowsTotal: null,
  rowsImported: 0,
  rowsRejected: 0,
  alerts: null,
  note: null,
  ...over,
});

const done = job({
  stage: "DONE",
  status: "PARTIAL",
  finishedAt: "2026-10-20T09:15:34Z",
  rowsTotal: 3,
  rowsImported: 2,
  rowsRejected: 1,
  alerts: 4,
  note: "1 rows rejected: unknown client (1)",
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** The engine: the job runs through the import on the first poll and ends on the second. */
let polls: unknown[] = [];

const routes: Record<string, () => Response> = {
  "POST /api/imports": () => json(job(), 202),
  "GET /api/imports": () => json([]),
  "GET /api/imports/7": () => json(polls.shift() ?? done),
  "DELETE /api/data": () => new Response(null, { status: 204 }),
  "GET /api/data": () => json({ transactions: 397_853, alerts: 6_688 }),
};

beforeEach(() => {
  polls = [job({ stage: "IMPORT", rowsTotal: 3, rowsImported: 1 }), done];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const route = routes[`${init?.method ?? "GET"} ${url}`];
      return route ? route() : json({ message: "not found" }, 404);
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ImportPage", () => {
  it("uploads a file, follows it through the import and shows what it brought", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onDataChanged = vi.fn();
    render(<ImportPage onDataChanged={onDataChanged} />);

    const file = new File(["transaction ID;client ID\n"], "tx_july.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Transactions file"), { target: { files: [file] } });
    expect(await screen.findByText("Validate…")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(await screen.findByText("1 of 3 rows")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(await screen.findByText("Import complete")).toBeInTheDocument();
    expect(screen.getByText("1 rows rejected: unknown client (1)")).toBeInTheDocument();
    expect(screen.getByText("1m 34s")).toBeInTheDocument();
    expect(onDataChanged).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/imports",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload another file" }));
    expect(screen.getByRole("button", { name: "Upload a transactions file" })).toBeInTheDocument();
  });

  it("lists a rule approval's recalculation in the history without following it as an upload", async () => {
    const recalculation = job({
      id: 8,
      fileName: null,
      fileSize: null,
      rule: "B2 v3",
      stage: "RUN",
    });
    routes["GET /api/imports"] = () => json([recalculation]);
    render(<ImportPage onDataChanged={() => {}} />);

    expect(await screen.findByText("Recalculation · B2 v3 approved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload a transactions file" })).toBeInTheDocument();
    routes["GET /api/imports"] = () => json([]);
  });

  it("shows a failed import with its reason", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    polls = [
      job({
        stage: "FAILED",
        status: "FAILED",
        finishedAt: "2026-10-20T09:14:03Z",
        note: "missing column currency",
      }),
    ];
    render(<ImportPage onDataChanged={() => {}} />);
    const file = new File(["x"], "broken.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Transactions file"), { target: { files: [file] } });
    await screen.findByText("Validate…");

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(await screen.findByText("Import failed")).toBeInTheDocument();
    expect(screen.getByText("missing column currency")).toBeInTheDocument();
  });

  it("deletes the transactions only after DELETE is typed", async () => {
    const onDataChanged = vi.fn();
    render(<ImportPage onDataChanged={onDataChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete all data" }));

    const dialog = screen.getByRole("dialog", { name: "Delete all data" });
    expect(await within(dialog).findByText("397,853")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Delete all data" });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByPlaceholderText("DELETE"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(onDataChanged).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("Transactions deleted.");
    expect(fetch).toHaveBeenCalledWith("/api/data", expect.objectContaining({ method: "DELETE" }));
  });
});
