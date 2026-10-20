import { describe, expect, it } from "vitest";

import { liveVersions } from "../api";
import { bandOf, listKeys, segmentsOf, ticksOf } from "../bands";
import { CONFIG, RULES } from "./fixtures";

const BANDS = CONFIG.payload.bands;

describe("bands", () => {
  it("tiles the scale, each segment from one past the band below it, weighted by the scores it covers", () => {
    expect(segmentsOf(BANDS).map(({ from, to, width }) => ({ from, to, width }))).toEqual([
      { from: 0, to: 24, width: 25 },
      { from: 25, to: 44, width: 20 },
      { from: 45, to: 64, width: 20 },
      { from: 65, to: 84, width: 20 },
      { from: 85, to: 100, width: 16 },
    ]);
  });

  it("finds the band a score falls into", () => {
    expect(bandOf(BANDS, 0)).toBe("AUTO_CLOSE");
    expect(bandOf(BANDS, 24)).toBe("AUTO_CLOSE");
    expect(bandOf(BANDS, 25)).toBe("REVIEW_LOW");
    expect(bandOf(BANDS, 70)).toBe("REVIEW_HIGH");
    expect(bandOf(BANDS, 100)).toBe("ESCALATE");
  });

  it("steps the ticks evenly up to the top of the scale", () => {
    expect(ticksOf(BANDS)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it("joins rule keys the way a sentence does", () => {
    expect(listKeys([])).toBe("");
    expect(listKeys(["A3"])).toBe("A3");
    expect(listKeys(["A3", "C1"])).toBe("A3 and C1");
    expect(listKeys(["A1", "A3", "C1"])).toBe("A1, A3 and C1");
  });

  it("keeps one version per rule key: the active one, else the newest", () => {
    expect(liveVersions(RULES).map((r) => [r.key, r.version, r.status])).toEqual([
      ["A1", 1, "active"],
      ["A3", 1, "active"],
      ["B2", 1, "active"],
      ["C1", 1, "active"],
    ]);
  });
});
