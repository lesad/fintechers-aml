import { useState } from "react";

import type { QueueItem } from "./queue";
import type { RiskLevel } from "@/components";

export type Decision = {
  action: "False Positive" | "Escalated" | "Reported";
  reason: string;
  /** `YYYY-MM-DD HH:mm` */
  at: string;
  by: string;
  /** The case's rule rating, so the header's open counts can drop false positives. */
  rating: RiskLevel | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Decisions per transaction id, in browser memory until the engine stores them. */
export function useDecisions() {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  return {
    decisions,
    decide: (id: string, d: Pick<Decision, "action" | "reason" | "rating" | "by">) =>
      setDecisions((s) => ({
        ...s,
        [id]: { ...d, at: stamp(new Date()) },
      })),
    /** The queue with each decided item's status replaced by its decision. */
    apply: (items: QueueItem[]): QueueItem[] =>
      items.map((r) => {
        const d = decisions[r.id];
        return d ? { ...r, status: d.action } : r;
      }),
    /** Server counts per rating, minus the false positives marked here. */
    openCounts: (counts: Record<RiskLevel, number>): Record<RiskLevel, number> => {
      const open = { ...counts };
      for (const d of Object.values(decisions))
        if (d.action !== "Escalated" && d.rating) open[d.rating] = Math.max(0, open[d.rating] - 1);
      return open;
    },
  };
}
