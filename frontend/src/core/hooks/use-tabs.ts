import { useState } from "react";

/**
 * Open/active state for a strip of closable tabs after one fixed home tab.
 * `active === null` means the home tab is shown.
 */
export function useTabs() {
  const [state, setState] = useState<{ open: string[]; active: string | null }>({
    open: [],
    active: null,
  });

  return {
    open: state.open,
    active: state.active,
    /** Adds the tab if missing; `background` keeps the current tab active. */
    openTab: (id: string, background = false) =>
      setState((s) => ({
        open: s.open.includes(id) ? s.open : [...s.open, id],
        active: background ? s.active : id,
      })),
    /** Closing the active tab activates its right neighbour, else its left one, else home. */
    closeTab: (id: string) =>
      setState((s) => {
        const i = s.open.indexOf(id);
        const open = s.open.filter((t) => t !== id);
        const active = s.active === id ? (open[i] ?? open[i - 1] ?? null) : s.active;
        return { open, active };
      }),
    select: (id: string | null) => setState((s) => ({ ...s, active: id })),
  };
}
