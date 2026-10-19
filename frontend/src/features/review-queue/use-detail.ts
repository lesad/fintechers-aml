import { useEffect, useState } from "react";

import { fetchDetail, NotFoundError, type TransactionDetail } from "./api";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; data: TransactionDetail }
  | { status: "not-found" }
  | { status: "error"; message: string };

/** One transaction's detail from the engine, fetched once per id and again on `reload`. */
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

  return {
    ...state,
    retry: () => setAttempt((a) => a + 1),
    /** Fetches again without the loading state, so what is shown stays until the new data arrives. */
    reload: () =>
      fetchDetail(id)
        .then((data) => setState({ status: "ready", data }))
        // A failed reload keeps the detail shown; the next one catches up.
        .catch(() => {}),
  };
}
