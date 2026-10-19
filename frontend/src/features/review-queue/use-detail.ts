import { useEffect, useState } from "react";

import { fetchDetail, NotFoundError, type TransactionDetail } from "./api";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; data: TransactionDetail }
  | { status: "not-found" }
  | { status: "error"; message: string };

/** One transaction's detail from the engine, fetched once per id. */
export function useDetail(id: string) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetchDetail(id, ctrl.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof NotFoundError) setState({ status: "not-found" });
        else
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => ctrl.abort();
  }, [id, attempt]);

  return { ...state, retry: () => setAttempt((a) => a + 1) };
}
