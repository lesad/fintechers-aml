import { useEffect, useRef, useState } from "react";

import { fetchFlagged, type TransactionPage } from "./api";
import { type QueueItem, toQueueItem } from "./queue";

import type { RiskLevel } from "@/components";

const PAGE_SIZE = 50;

type QueueState = {
  items: QueueItem[];
  /** Matching rows on the server, across all pages. */
  total: number;
  countsByRating: TransactionPage["countsByRating"] | null;
  nextPage: number;
  loading: boolean;
  error: string | null;
};

const EMPTY: QueueState = {
  items: [],
  total: 0,
  countsByRating: null,
  nextPage: 0,
  loading: true,
  error: null,
};

/**
 * Flagged transactions from the engine, a page at a time: `loadMore` appends the next page.
 * A new search, rating or status starts over from page 0; all three filter on the engine; the search waits 300 ms for typing to stop.
 */
/** `status` is the engine's comma-separated status codes (`statusParam`). */
export function useQueue(query: string, rating: RiskLevel | "all", status: string) {
  const [state, setState] = useState<QueueState>(EMPTY);
  const inFlight = useRef<AbortController | null>(null);

  const load = (page: number, reset: boolean) => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    // The counts cover the whole queue whatever the filters, so a new list keeps the last ones.
    setState((s) => ({
      ...(reset ? { ...EMPTY, countsByRating: s.countsByRating } : s),
      loading: true,
      error: null,
    }));
    fetchFlagged({ q: query, rating, status, page, size: PAGE_SIZE }, ctrl.signal)
      .then((res) =>
        setState((s) => ({
          items: [...(reset ? [] : s.items), ...res.items.map(toQueueItem)],
          total: res.total,
          countsByRating: res.countsByRating,
          nextPage: page + 1,
          loading: false,
          error: null,
        })),
      )
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      });
  };

  useEffect(() => {
    const timer = setTimeout(() => load(0, true), query ? 300 : 0);
    return () => {
      clearTimeout(timer);
      inFlight.current?.abort();
    };
    // `load` closes over query, rating and status, the only inputs that start a new list.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [query, rating, status]);

  const done = !state.loading && state.items.length >= state.total;
  return {
    ...state,
    done,
    loadMore: () => {
      if (!state.loading && !done && !state.error) load(state.nextPage, false);
    },
    retry: () => load(state.nextPage, state.items.length === 0),
  };
}
