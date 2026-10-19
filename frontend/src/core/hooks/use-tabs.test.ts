import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useTabs } from "./use-tabs";

describe("useTabs", () => {
  it("opens a tab once and activates it, unless opened in the background", () => {
    const { result } = renderHook(() => useTabs());

    act(() => result.current.openTab("a"));
    act(() => result.current.openTab("a"));
    act(() => result.current.openTab("b", true));

    expect(result.current.open).toEqual(["a", "b"]);
    expect(result.current.active).toBe("a");
  });

  it("activates the right neighbour, then the left one, then home when the active tab closes", () => {
    const { result } = renderHook(() => useTabs());
    act(() => {
      result.current.openTab("a");
      result.current.openTab("b");
      result.current.openTab("c");
      result.current.select("b");
    });

    act(() => result.current.closeTab("b"));
    expect(result.current.active).toBe("c");

    act(() => result.current.closeTab("c"));
    expect(result.current.active).toBe("a");

    act(() => result.current.closeTab("a"));
    expect(result.current.active).toBeNull();
  });

  it("keeps the active tab when another one closes", () => {
    const { result } = renderHook(() => useTabs());
    act(() => {
      result.current.openTab("a");
      result.current.openTab("b");
    });

    act(() => result.current.closeTab("a"));

    expect(result.current).toMatchObject({ open: ["b"], active: "b" });
  });
});
