import { useEffect, useState } from "react";

import { fetchHistory, fetchOpoRules } from "./api";

import type { HistoryTransaction, OpoRule } from "./api";

type Facts =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rules: OpoRule[]; txs: HistoryTransaction[] };

const AROUND = 200;

/** The rule versions and the client's transactions around the reported one (up to 200 a side). */
export function useReportFacts(id: string, current: HistoryTransaction | undefined) {
  const [facts, setFacts] = useState<Facts>({ status: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      fetchOpoRules(ctrl.signal),
      fetchHistory(id, { side: "older", limit: AROUND }, ctrl.signal),
      fetchHistory(id, { side: "newer", limit: AROUND }, ctrl.signal),
    ])
      .then(([rules, older, newer]) =>
        setFacts({
          status: "ready",
          rules,
          txs: [...newer.items, ...(current ? [current] : []), ...older.items],
        }),
      )
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted)
          setFacts({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => ctrl.abort();
  }, [id, current]);
  return facts;
}
