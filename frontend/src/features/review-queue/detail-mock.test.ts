import { describe, expect, it } from "vitest";

import { clientHistory } from "./detail-mock";
import { MOCK_QUEUE } from "./mock";

describe("clientHistory", () => {
  it("lists newest first and includes every queue transaction of the client", () => {
    for (const client of new Set(MOCK_QUEUE.map((q) => q.client))) {
      const history = clientHistory(client);
      const dates = history.map((h) => h.dt);
      expect(dates).toEqual(dates.toSorted().toReversed());
      for (const q of MOCK_QUEUE.filter((r) => r.client === client))
        expect(history.map((h) => h.id)).toContain(q.id);
    }
  });

  it("is deterministic per client", () => {
    expect(clientHistory("K007731")).toBe(clientHistory("K007731"));
    expect(clientHistory("K007731").length).toBeGreaterThan(5);
  });
});
