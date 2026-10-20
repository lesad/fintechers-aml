import { useEffect, useRef, useState } from "react";

import { pageControls } from "@/utils";

import {
  type Backtest,
  type BacktestRow,
  type BacktestView,
  fetchBacktest,
  fetchBacktestRows,
} from "./api";

type SummaryState =
  | { status: "loading" }
  | { status: "running"; data: Backtest }
  | { status: "ready"; data: Backtest }
  | { status: "none" }
  /** The engine could not finish the backtest. */
  | { status: "failed"; message: string }
  /** The engine could not be asked. */
  | { status: "error"; message: string };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** How often a running backtest is asked about. */
const POLL_MS = 2000;

/** The draft's stored backtest; while the engine is still running it, asked about again every [POLL_MS]. */
export function useBacktestSummary(draftId: number) {
  const [state, setState] = useState<SummaryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () =>
      fetchBacktest(draftId, ctrl.signal).then(
        (data) => {
          if (ctrl.signal.aborted) return;
          if (!data) return setState({ status: "none" });
          if (data.status === "RUNNING") {
            setState({ status: "running", data });
            timer = setTimeout(poll, POLL_MS);
          } else if (data.status === "FAILED") {
            setState({ status: "failed", message: data.error ?? "unknown error" });
          } else setState({ status: "ready", data });
        },
        (err: unknown) =>
          !ctrl.signal.aborted && setState({ status: "error", message: message(err) }),
      );
    setState({ status: "loading" });
    void poll();
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [draftId, attempt]);

  return { ...state, retry: () => setAttempt((a) => a + 1) };
}

const PAGE_SIZE = 100;

type RowsState = {
  items: BacktestRow[];
  total: number;
  next: number;
  loading: boolean;
  error: string | null;
};

const START: RowsState = { items: [], total: 0, next: 0, loading: true, error: null };

/**
 * The stored backtest's rows in one view, a page at a time, filtered and ordered by the engine. [version] changes
 * when a new backtest is stored, which starts the list over.
 */
export function useBacktestRows(draftId: number, view: BacktestView, version: string | null) {
  const [state, setState] = useState<RowsState>(START);
  const ctrl = useRef<AbortController | null>(null);

  const load = (page: number, reset: boolean) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState((s) => ({ ...(reset ? START : s), loading: true, error: null }));
    fetchBacktestRows(draftId, { view, page, size: PAGE_SIZE }, c.signal)
      .then((res) =>
        setState((s) => ({
          items: [...(reset ? [] : s.items), ...res.items],
          total: res.total,
          next: page + 1,
          loading: false,
          error: null,
        })),
      )
      .catch((err: unknown) => {
        if (!c.signal.aborted) setState((s) => ({ ...s, loading: false, error: message(err) }));
      });
  };

  useEffect(() => {
    if (version !== null) load(0, true);
    return () => ctrl.current?.abort();
    // `load` closes over the inputs listed; a new list starts when any of them changes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, view, version]);

  return {
    ...state,
    ...pageControls(state, state.next, load),
  };
}
