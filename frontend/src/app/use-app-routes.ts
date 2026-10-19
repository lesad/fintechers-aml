import { useEffect, useRef } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";

import { useTabs } from "@/hooks";

/**
 * The app's URL: `/` is the review overview, `/transactions/:id` the overview with that transaction's tab
 * active (so Back returns to the list), `/rules` the rules page; App sends anything else back to `/`.
 */
export function useAppRoutes() {
  const navigate = useNavigate();
  const rulesOpen = useMatch("/rules") !== null;
  const activeTx = useMatch("/transactions/:id")?.params.id ?? null;
  const tabs = useTabs(activeTx, (id, { replace }) =>
    navigate(id ? `/transactions/${encodeURIComponent(id)}` : "/", { replace }),
  );

  // Where the overview was when the rules page opened, so the cog goes back to the same tab.
  const { pathname } = useLocation();
  const overview = useRef("/");
  useEffect(() => {
    if (!rulesOpen) overview.current = pathname;
  }, [rulesOpen, pathname]);

  return {
    tabs,
    rulesOpen,
    toggleRules: () => void navigate(rulesOpen ? overview.current : "/rules"),
  };
}
