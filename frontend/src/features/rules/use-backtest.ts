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

/**
 * Where a backtest the tab watches stands: `running`; `done` or `failed` once one it saw running ends; `idle` when
 * there is nothing to wait for (it was already finished, or there is none).
 */
export type BacktestProgress = "running" | "done" | "failed" | "idle";

/**
 * The draft's stored backtest; while the engine is still running it, asked about again every [POLL_MS].
 * [onProgress] hears where it stands after every answer.
 */
export function useBacktestSummary(
  draftId: number,
  onProgress?: (progress: BacktestProgress, backtest: Backtest | null) => void,
) {
  const [state, setState] = useState<SummaryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // The latest callback, so a new one from the parent does not restart the polling.
  const notify = useRef(onProgress);
  useEffect(() => {
    notify.current = onProgress;
  });

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ran = false;
    const poll = () =>
      fetchBacktest(draftId, ctrl.signal).then(
        (data) => {
          if (ctrl.signal.aborted) return;
          if (data?.status === "RUNNING") {
            ran = true;
            setState({ status: "running", data });
            notify.current?.("running", data);
            timer = setTimeout(poll, POLL_MS);
            return;
          }
          if (!data) setState({ status: "none" });
          else if (data.status === "FAILED")
            setState({ status: "failed", message: data.error ?? "unknown error" });
          else setState({ status: "ready", data });
          notify.current?.(ran ? (data?.status === "FAILED" ? "failed" : "done") : "idle", data);
        },
        (err: unknown) => {
          if (ctrl.signal.aborted) return;
          setState({ status: "error", message: message(err) });
          notify.current?.("idle", null);
        },
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
  /** The list these rows belong to: draft, view and backtest version. */
  list: string;
  items: BacktestRow[];
  total: number;
  next: number;
  loading: boolean;
  error: string | null;
};

const start = (list: string): RowsState => ({
  list,
  items: [],
  total: 0,
  next: 0,
  loading: true,
  error: null,
});

/**
 * The stored backtest's rows in one view, a page at a time, filtered and ordered by the engine. [version] changes
 * when a new backtest is stored, which starts the list over.
 */
export function useBacktestRows(draftId: number, view: BacktestView, version: string | null) {
  const list = `${draftId}:${view}:${version}`;
  const [stored, setState] = useState<RowsState>(() => start(list));
  const ctrl = useRef<AbortController | null>(null);
  // Rows of another view are not this view's: until its first page comes, this view is empty and loading, so the
  // list's end cannot ask for the next page with the previous view's place (it did, page after empty page).
  const state = stored.list === list ? stored : start(list);

  const load = (page: number, reset: boolean) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState((s) => ({ ...(reset ? start(list) : s), loading: true, error: null }));
    fetchBacktestRows(draftId, { view, page, size: PAGE_SIZE }, c.signal)
      .then((res) =>
        setState((s) => ({
          list,
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
