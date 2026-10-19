import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { useTabs } from "./use-tabs";

/** The tabs with their active one held in local state, standing in for the URL; records each move. */
function useTabsHere(start: string | null = null) {
  const [active, setActive] = useState(start);
  const [moves, setMoves] = useState<string[]>([]);
  const tabs = useTabs(active, (id, { replace }) => {
    setActive(id);
    setMoves((m) => [...m, `${replace ? "replace" : "push"} ${id ?? "home"}`]);
  });
  return { ...tabs, moves };
}

describe("useTabs", () => {
  it("opens a tab once and goes there, unless opened in the background", () => {
    const { result } = renderHook(() => useTabsHere());

    act(() => result.current.openTab("a"));
    act(() => result.current.openTab("a"));
    act(() => result.current.openTab("b", true));

    expect(result.current.open).toEqual(["a", "b"]);
    expect(result.current.active).toBe("a");
    expect(result.current.moves).toEqual(["push a", "push a"]);
  });

  it("moves to the right neighbour, then the left one, then home when the active tab closes", () => {
    const { result } = renderHook(() => useTabsHere());
    act(() => result.current.openTab("a"));
    act(() => result.current.openTab("b"));
    act(() => result.current.openTab("c"));
    act(() => result.current.select("b"));

    act(() => result.current.closeTab("b"));
    expect(result.current.active).toBe("c");

    act(() => result.current.closeTab("c"));
    expect(result.current.active).toBe("a");

    act(() => result.current.closeTab("a"));
    expect(result.current.active).toBeNull();
    expect(result.current.moves.slice(-3)).toEqual(["replace c", "replace a", "replace home"]);
  });

  it("keeps the active tab when another one closes", () => {
    const { result } = renderHook(() => useTabsHere());
    act(() => result.current.openTab("a"));
    act(() => result.current.openTab("b"));

    act(() => result.current.closeTab("a"));

    expect(result.current).toMatchObject({ open: ["b"], active: "b" });
  });

  it("opens the tab that is active without being open, as after a reload", () => {
    const { result } = renderHook(() => useTabsHere("x"));
    expect(result.current.open).toEqual(["x"]);
  });
});
