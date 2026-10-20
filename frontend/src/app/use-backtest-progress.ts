import { useEffect, useState } from "react";

import type { Backtest, BacktestProgress } from "@/features/rules";

/** What a backtest tab shows instead of its icon: a spinner while it runs, a check once it finished unseen. */
export type TabProgress = "running" | "done";

type Toast = { message: string; link?: { to: string; label: string } };

const without = (state: Record<string, TabProgress>, tab: string) => {
  if (!(tab in state)) return state;
  const next = { ...state };
  delete next[tab];
  return next;
};

/**
 * Backtests running in their tabs while the reviewer works elsewhere: the tab spins until the backtest ends, then
 * shows a check until the tab is opened, and a toast says it finished.
 */
export function useBacktestProgress(active: string | null) {
  const [progress, setProgress] = useState<Record<string, TabProgress>>({});
  const [toast, setToast] = useState<Toast | null>(null);

  // A finished backtest's check goes once its tab is looked at.
  const seen = active !== null && progress[active] === "done" ? active : null;
  useEffect(() => {
    if (seen) setProgress((p) => without(p, seen));
  }, [seen]);

  const report = (tab: string, p: BacktestProgress, backtest: Backtest | null) => {
    if (p === "running") {
      setProgress((s) => (s[tab] === "running" ? s : { ...s, [tab]: "running" }));
      return;
    }
    const open = active === tab;
    setProgress((s) => (p === "done" && !open ? { ...s, [tab]: "done" } : without(s, tab)));
    if (p !== "idle" && backtest) {
      const what = `Backtest of ${backtest.ruleKey} v${backtest.draftVersion}`;
      setToast({
        message: p === "done" ? `${what} finished` : `${what} failed`,
        link: open ? undefined : { to: `/backtests/${backtest.draftId}`, label: "Open" },
      });
    }
  };

  return { progress, report, toast, closeToast: () => setToast(null) };
}
