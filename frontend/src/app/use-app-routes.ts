import { useEffect, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";

import { useTabs } from "@/hooks";

/** The settings tab's id; a transaction tab's id is the transaction's, a draft's backtest `bt:<draftId>`. */
export const SETTINGS_TAB = "settings";

/** The sections of the settings tab, each its own path under `/settings`. */
export type SettingsSub = "rules" | "triage";

/** The section the settings tab opens on when nothing says otherwise. */
const DEFAULT_SUB: SettingsSub = "rules";

export const settingsPath = (sub: SettingsSub) => `/settings/${sub}`;

export const backtestTab = (draftId: number) => `bt:${draftId}`;

/** The draft of a backtest tab, or null for any other tab. */
export function parseBacktestTab(id: string) {
  const m = /^bt:(\d+)$/.exec(id);
  return m ? { draftId: Number(m[1]) } : null;
}

const pathOf = (id: string | null, sub: SettingsSub) => {
  if (!id) return "/";
  if (id === SETTINGS_TAB) return settingsPath(sub);
  const bt = parseBacktestTab(id);
  return bt ? `/backtests/${bt.draftId}` : `/transactions/${encodeURIComponent(id)}`;
};

/**
 * The app's URL: `/` is the review overview; a tab has its own path, so Back returns to the list — a transaction
 * `/transactions/:id`, the settings `/settings/rules` (detection rules) or `/settings/triage` (triage scoring),
 * a draft's backtest `/backtests/:draftId`. `/rules` redirects to `/settings/rules`, query string kept, so older
 * links and the `?rule=<id>` deep link keep working. `/import` is the data import page, which replaces the
 * overview; App sends anything else back to `/`.
 */
export function useAppRoutes() {
  const navigate = useNavigate();
  const dataImport = useMatch("/import") !== null;
  const tx = useMatch("/transactions/:id")?.params.id;
  const settingsRules = useMatch(settingsPath("rules")) !== null;
  const settingsTriage = useMatch(settingsPath("triage")) !== null;
  const bt = useMatch("/backtests/:id")?.params.id;
  const active =
    tx ?? (settingsRules || settingsTriage ? SETTINGS_TAB : bt ? backtestTab(Number(bt)) : null);

  // The section the settings tab last showed, so switching away and back returns to the same one.
  const [sub, setSub] = useState<SettingsSub>(DEFAULT_SUB);
  const current: SettingsSub = settingsTriage ? "triage" : settingsRules ? "rules" : sub;
  useEffect(() => {
    if (settingsRules || settingsTriage) setSub(settingsTriage ? "triage" : "rules");
  }, [settingsRules, settingsTriage]);

  const tabs = useTabs(active, (id, { replace }) => navigate(pathOf(id, current), { replace }));

  // Where the overview was when the import page opened, so its button goes back to the same tab.
  const { pathname } = useLocation();
  const overview = useRef("/");
  useEffect(() => {
    if (!dataImport) overview.current = pathname;
  }, [dataImport, pathname]);

  return {
    tabs,
    /** The settings tab's section and how to switch it — switching is a navigation, so Back undoes it. */
    settings: {
      sub: current,
      select: (next: SettingsSub) => void navigate(settingsPath(next)),
    },
    importOpen: dataImport,
    toggleImport: () => void navigate(dataImport ? overview.current : "/import"),
  };
}
