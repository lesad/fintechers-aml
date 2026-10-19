import { useState } from "react";

import type { QueueItem } from "./queue";

export type Decision = {
  action: "Closed" | "Escalated";
  reason: string;
  /** `YYYY-MM-DD HH:mm` */
  at: string;
  by: string;
  /** Came with the mock data; can't be undone. */
  seed?: boolean;
};

// The design's one pre-decided case.
const SEED: Record<string, Decision> = {
  TX000004801: {
    action: "Closed",
    reason: "Location matches the card travel notice; confirmed with the client by phone.",
    at: "2026-10-15 17:10",
    by: "M. Svobodová",
    seed: true,
  },
};

/** Decisions per transaction id, in memory until the engine stores them. */
export function useDecisions() {
  const [decisions, setDecisions] = useState<Record<string, Decision>>(SEED);
  return {
    decisions,
    decide: (id: string, action: Decision["action"], reason: string) =>
      setDecisions((s) => ({
        ...s,
        // shortcut: the mock clock and a fixed reviewer, until there is a signed-in user and real time
        [id]: { action, reason, at: "2026-10-19 14:30", by: "J. Novák" },
      })),
    undo: (id: string) =>
      setDecisions((s) => {
        const { [id]: _removed, ...rest } = s;
        return rest;
      }),
    /** The queue with each decided item's status replaced by its decision. */
    apply: (items: QueueItem[]): QueueItem[] =>
      items.map((r) => {
        const d = decisions[r.id];
        return d ? { ...r, status: d.action } : r;
      }),
  };
}
