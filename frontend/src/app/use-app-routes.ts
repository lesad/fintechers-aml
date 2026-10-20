import { useEffect, useRef } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";

import { useTabs } from "@/hooks";

/** The rules tab's id; a transaction tab's id is the transaction's, a draft's backtest `bt:<draftId>`. */
export const RULES_TAB = "rules";

export const backtestTab = (draftId: number) => `bt:${draftId}`;

/** The draft of a backtest tab, or null for any other tab. */
export function parseBacktestTab(id: string) {
  const m = /^bt:(\d+)$/.exec(id);
  return m ? { draftId: Number(m[1]) } : null;
}

const pathOf = (id: string | null) => {
  if (!id) return "/";
  if (id === RULES_TAB) return "/rules";
  const bt = parseBacktestTab(id);
  return bt ? `/backtests/${bt.draftId}` : `/transactions/${encodeURIComponent(id)}`;
};

/**
 * The app's URL: `/` is the review overview; a tab has its own path, so Back returns to the list — a transaction
 * `/transactions/:id`, the rules `/rules`, a draft's backtest `/backtests/:draftId`. `/import` is the data import
 * page, which replaces the overview; App sends anything else back to `/`.
 */
export function useAppRoutes() {
  const navigate = useNavigate();
  const dataImport = useMatch("/import") !== null;
  const tx = useMatch("/transactions/:id")?.params.id;
  const rules = useMatch("/rules") !== null;
  const bt = useMatch("/backtests/:id")?.params.id;
  const active = tx ?? (rules ? RULES_TAB : bt ? backtestTab(Number(bt)) : null);
  const tabs = useTabs(active, (id, { replace }) => navigate(pathOf(id), { replace }));

  // Where the overview was when the import page opened, so its button goes back to the same tab.
  const { pathname } = useLocation();
  const overview = useRef("/");
  useEffect(() => {
    if (!dataImport) overview.current = pathname;
  }, [dataImport, pathname]);

  return {
    tabs,
    importOpen: dataImport,
    toggleImport: () => void navigate(dataImport ? overview.current : "/import"),
  };
}
