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
 * A new search or rating starts over from page 0; the search waits 300 ms for typing to stop.
 */
export function useQueue(query: string, rating: RiskLevel | "all") {
  const [state, setState] = useState<QueueState>(EMPTY);
  const inFlight = useRef<AbortController | null>(null);

  const load = (page: number, reset: boolean) => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setState((s) => ({ ...(reset ? EMPTY : s), loading: true, error: null }));
    fetchFlagged({ q: query, rating, page, size: PAGE_SIZE }, ctrl.signal)
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
    // `load` closes over query and rating, the only inputs that start a new list.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [query, rating]);

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
