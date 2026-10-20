import { useEffect, useRef, useState } from "react";

import { ASSESSMENT, fetchAiResult, runAiResult } from "./ai";
import { fetchDetail } from "./api";
import { caseState } from "./case-state";
import { type QueueItem, toAssess } from "./queue";

import type { AiStatus, RiskLevel } from "@/components";

const toLevel = (r: string) => (r.charAt(0).toUpperCase() + r.slice(1)) as RiskLevel;

/** Runs every alert's assessment like the detail does; the row shows its triage alert's rating, as the engine does. */
async function assess(id: string, signal: AbortSignal): Promise<AiStatus> {
  const { alertIds } = caseState(await fetchDetail(id, signal), undefined);
  const results = await Promise.all(
    alertIds.map(
      async (alertId) =>
        (await fetchAiResult(alertId, ASSESSMENT, signal)) ??
        runAiResult(alertId, ASSESSMENT, signal),
    ),
  );
  const first = results[0];
  return first?.status === "ready" ? { rating: toLevel(first.body.rating) } : "none";
}

/**
 * Generates the AI rating of the first open cases on the queue's first load, so the dashboard opens with them.
 * Returns the queue rows with each one's rating laid over: `running` while the model works.
 */
export function useAutoAssess(items: QueueItem[], loaded: boolean) {
  const [ai, setAi] = useState<Record<string, AiStatus>>({});
  const started = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!loaded || items.length === 0 || started.current) return;
    const ctrl = new AbortController();
    started.current = ctrl;
    for (const { id } of toAssess(items)) {
      setAi((s) => ({ ...s, [id]: "running" }));
      assess(id, ctrl.signal)
        .catch((): AiStatus => "none")
        .then((status) => ctrl.signal.aborted || setAi((s) => ({ ...s, [id]: status })));
    }
  }, [items, loaded]);

  useEffect(
    () => () => {
      started.current?.abort();
      started.current = null;
    },
    [],
  );

  return items.map((r) => {
    const status = ai[r.id];
    return status === undefined || status === "none" ? r : { ...r, ai: status };
  });
}
