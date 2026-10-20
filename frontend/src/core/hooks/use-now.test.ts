import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useNow } from "./use-now";

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("moves on with the clock instead of staying at the first render", () => {
    vi.useFakeTimers({ now: new Date("2026-10-20T09:00:00Z") });
    const { result } = renderHook(() => useNow(30_000));
    expect(result.current.toISOString()).toBe("2026-10-20T09:00:00.000Z");

    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.toISOString()).toBe("2026-10-20T09:01:00.000Z");
  });
});
