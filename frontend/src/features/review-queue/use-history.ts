import { useEffect, useRef, useState } from "react";

import { fetchHistory, type HistoryTransaction } from "./api";

type Side = "older" | "newer";

type SideState = {
  items: HistoryTransaction[];
  more: boolean;
  loading: boolean;
  error: string | null;
};

const START: SideState = { items: [], more: false, loading: true, error: null };

/**
 * The client's transactions around transaction `id`, five a side to begin with; `load` fetches the next
 * five on one side, starting after the last one shown. Newest first on both sides.
 */
export function useHistory(id: string) {
  const [sides, setSides] = useState<Record<Side, SideState>>({ older: START, newer: START });
  const ctrl = useRef<AbortController | null>(null);

  const fetchSide = (side: Side, anchor: string, signal: AbortSignal) => {
    setSides((s) => ({ ...s, [side]: { ...s[side], loading: true, error: null } }));
    fetchHistory(anchor, side, signal)
      .then((page) =>
        setSides((s) => ({
          ...s,
          [side]: {
            items:
              side === "older"
                ? [...s[side].items, ...page.items]
                : [...page.items, ...s[side].items],
            more: page.more,
            loading: false,
            error: null,
          },
        })),
      )
      .catch((err: unknown) => {
        if (signal.aborted) return;
        const error = err instanceof Error ? err.message : String(err);
        setSides((s) => ({ ...s, [side]: { ...s[side], loading: false, error } }));
      });
  };

  useEffect(() => {
    const c = new AbortController();
    ctrl.current = c;
    setSides({ older: START, newer: START });
    fetchSide("older", id, c.signal);
    fetchSide("newer", id, c.signal);
    return () => c.abort();
    // `fetchSide` only closes over the state setter; `id` is what starts a new history.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return {
    ...sides,
    load: (side: Side) => {
      const s = sides[side];
      // The next batch starts after the oldest one shown (older) or the newest one shown (newer).
      const anchor = (side === "older" ? s.items.at(-1)?.id : s.items[0]?.id) ?? id;
      if (!s.loading && ctrl.current) fetchSide(side, anchor, ctrl.current.signal);
    },
  };
}
