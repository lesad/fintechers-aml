import { useEffect, useState } from "react";

/** Moves to a tab (`null` = home); `replace` swaps the current history entry instead of adding one. */
type Go = (id: string | null, options: { replace: boolean }) => void;

/**
 * Open tabs for a strip of closable tabs after one fixed home tab. Which one is active lives outside
 * (the URL): the caller passes `active` (`null` = home) and `go` to change it, so Back and Forward move
 * between tabs. A tab that becomes active without being open (a reload, Back to a closed one) is opened.
 */
export function useTabs(active: string | null, go: Go) {
  const [open, setOpen] = useState<string[]>([]);

  useEffect(() => {
    if (active) setOpen((o) => (o.includes(active) ? o : [...o, active]));
  }, [active]);

  return {
    open,
    active,
    /** Adds the tab if missing and goes there; `background` only adds it. */
    openTab: (id: string, background = false) => {
      setOpen((o) => (o.includes(id) ? o : [...o, id]));
      if (!background) go(id, { replace: false });
    },
    /** Closing the active tab moves to its right neighbour, else its left one, else home. */
    closeTab: (id: string) => {
      const i = open.indexOf(id);
      const rest = open.filter((t) => t !== id);
      setOpen(rest);
      if (active === id) go(rest[i] ?? rest[i - 1] ?? null, { replace: true });
    },
    select: (id: string | null) => go(id, { replace: false }),
  };
}
