import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useBacktestProgress } from "./use-backtest-progress";

import type { Backtest } from "@/features/rules";

const BT = { ruleKey: "B2", draftVersion: 2, draftId: 12 } as Backtest;

describe("a backtest running in its tab", () => {
  it("spins, then checks until the tab is opened, and says it finished", () => {
    const notify = vi.fn();
    const { result, rerender } = renderHook(({ active }) => useBacktestProgress(active, notify), {
      initialProps: { active: null as string | null },
    });
    act(() => result.current.report("bt:12", "running", BT));
    expect(result.current.progress["bt:12"]).toBe("running");

    act(() => result.current.report("bt:12", "done", BT));
    expect(result.current.progress["bt:12"]).toBe("done");
    expect(notify).toHaveBeenCalledWith({
      message: "Backtest of B2 v2 finished",
      link: { to: "/backtests/12", label: "Open" },
    });

    rerender({ active: "bt:12" });
    expect(result.current.progress["bt:12"]).toBeUndefined();
  });

  it("finishes without a check or a link when its tab is open", () => {
    const notify = vi.fn();
    const { result } = renderHook(() => useBacktestProgress("bt:12", notify));
    act(() => result.current.report("bt:12", "running", BT));
    act(() => result.current.report("bt:12", "failed", BT));
    expect(result.current.progress["bt:12"]).toBeUndefined();
    expect(notify).toHaveBeenCalledWith({ message: "Backtest of B2 v2 failed", link: undefined });
  });

  it("stays quiet about a backtest that had already finished", () => {
    const notify = vi.fn();
    const { result } = renderHook(() => useBacktestProgress(null, notify));
    act(() => result.current.report("bt:12", "idle", BT));
    expect(result.current.progress).toEqual({});
    expect(notify).not.toHaveBeenCalled();
  });
});
