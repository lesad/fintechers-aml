import { useEffect, useRef } from "react";
import { useLocation, useMatch, useNavigate } from "react-router";

import { useTabs } from "@/hooks";

/** A page that replaces the review overview while open. */
type Page = "rules" | "import";

/**
 * The app's URL: `/` is the review overview, `/transactions/:id` the overview with that transaction's tab
 * active (so Back returns to the list), `/rules` the rules page and `/import` the data import page; App sends
 * anything else back to `/`.
 */
export function useAppRoutes() {
  const navigate = useNavigate();
  const rules = useMatch("/rules") !== null;
  const dataImport = useMatch("/import") !== null;
  const page: Page | null = rules ? "rules" : dataImport ? "import" : null;
  const activeTx = useMatch("/transactions/:id")?.params.id ?? null;
  const tabs = useTabs(activeTx, (id, { replace }) =>
    navigate(id ? `/transactions/${encodeURIComponent(id)}` : "/", { replace }),
  );

  // Where the overview was when another page opened, so its button goes back to the same tab.
  const { pathname } = useLocation();
  const overview = useRef("/");
  useEffect(() => {
    if (!page) overview.current = pathname;
  }, [page, pathname]);

  return {
    tabs,
    page,
    /** Opens [target], or goes back to the overview when it is already open. */
    togglePage: (target: Page) => void navigate(page === target ? overview.current : `/${target}`),
  };
}
