import { useEffect, useState } from "react";

import { type AiEndpoint, fetchAiResult, runAiResult } from "./ai";

export type AiState<T> =
  | { status: "loading" }
  | { status: "running" }
  | { status: "done"; result: T }
  | { status: "error"; message: string };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** One alert's latest AI result of a kind; when none is stored it generates one. "Running" lives only here. */
export function useAiResult<T>(alertId: number, endpoint: AiEndpoint<T>) {
  const [state, setState] = useState<AiState<T>>({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetchAiResult(alertId, endpoint, ctrl.signal)
      .then((stored) => {
        if (stored) return stored;
        setState({ status: "running" });
        return runAiResult(alertId, endpoint, ctrl.signal);
      })
      .then((result) => setState({ status: "done", result }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setState({ status: "error", message: message(err) });
      });
    return () => ctrl.abort();
  }, [alertId, endpoint]);

  const run = () => {
    setState({ status: "running" });
    runAiResult(alertId, endpoint)
      .then((result) => setState({ status: "done", result }))
      .catch((err: unknown) => setState({ status: "error", message: message(err) }));
  };

  return { state, run };
}
