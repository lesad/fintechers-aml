import { describe, expect, it, vi } from "vitest";

import { pageControls } from "./page-controls";

describe("pageControls", () => {
  it("asks for the next page only while more remain and nothing is loading or broken", () => {
    const load = vi.fn();
    const idle = { loading: false, error: null, items: [1, 2], total: 5 };
    pageControls(idle, 1, load).loadMore();
    expect(load).toHaveBeenCalledWith(1, false);

    load.mockClear();
    pageControls({ ...idle, loading: true }, 1, load).loadMore();
    pageControls({ ...idle, error: "boom" }, 1, load).loadMore();
    expect(pageControls({ ...idle, total: 2 }, 1, load).done).toBe(true);
    pageControls({ ...idle, total: 2 }, 1, load).loadMore();
    expect(load).not.toHaveBeenCalled();
  });

  it("retries from the start when nothing loaded yet", () => {
    const load = vi.fn();
    pageControls({ loading: false, error: "boom", items: [], total: 0 }, 0, load).retry();
    expect(load).toHaveBeenCalledWith(0, true);
  });
});
