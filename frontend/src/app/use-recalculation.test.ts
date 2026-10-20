import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRecalculation } from "./use-recalculation";

const job = (over: Record<string, unknown>) => ({
  id: 8,
  fileName: null,
  fileSize: null,
  rule: "B2 v3",
  by: "M. Svobodová",
  startedAt: "2026-10-20T09:14:00Z",
  finishedAt: null,
  stage: "RUN",
  status: null,
  rowsTotal: null,
  rowsImported: 0,
  rowsRejected: 0,
  alerts: null,
  note: null,
  ...over,
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the recalculation after a rule approval", () => {
  it("says it started, follows the job, then says how it ended and reloads", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const polls = [job({}), job({ stage: "DONE", status: "COMPLETED", alerts: 42 })];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/imports" ? json([job({})]) : json(polls.shift() ?? polls.at(-1)),
      ),
    );
    const notify = vi.fn();
    const onDone = vi.fn();
    const { result } = renderHook(() => useRecalculation(notify, onDone));

    act(() => result.current.start("B2 v3"));
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "B2 v3 approved. Recalculating the alerts in the background…",
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(2000));
    await waitFor(() =>
      expect(notify).toHaveBeenLastCalledWith({
        message: "Alerts recalculated with B2 v3: 42 new",
      }),
    );
    expect(onDone).toHaveBeenCalledOnce();
  });
});
