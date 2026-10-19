import { useEffect, useState } from "react";

import { fetchRules, type RuleVersion } from "./api";

type RulesState =
  | { status: "loading" }
  | { status: "ready"; versions: RuleVersion[] }
  | { status: "error"; message: string };

/** Every rule version from the engine; `reload` refetches after a save without a loading flash. */
export function useRules() {
  const [state, setState] = useState<RulesState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchRules(ctrl.signal)
      .then((versions) => setState({ status: "ready", versions }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => ctrl.abort();
  }, [attempt]);

  return {
    ...state,
    reload: () => setAttempt((a) => a + 1),
    retry: () => {
      setState({ status: "loading" });
      setAttempt((a) => a + 1);
    },
  };
}
