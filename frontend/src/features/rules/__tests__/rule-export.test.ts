import { describe, expect, it } from "vitest";

import { rulesValidAt, versionChanges } from "../rule-export";
import { A1, B2, B2_V2, C1_V1, C1_V2 } from "./fixtures";

const C1_V1_LIVE = { ...C1_V1, createdAt: "2026-10-01T10:00:00+02:00" };
const C1_V2_LIVE = {
  ...C1_V2,
  createdAt: "2026-10-10T09:00:00+02:00",
  approver: "M. Dvořák",
  approvedAt: "2026-10-12T14:00:00+02:00",
};
const versions = [A1, B2, B2_V2, C1_V1_LIVE, C1_V2_LIVE];

describe("rulesValidAt", () => {
  it("picks the version that was live at the date, valid from approval until the next approval", () => {
    const c1 = rulesValidAt(versions, new Date("2026-10-11T00:00:00+02:00")).find(
      (r) => r.key === "C1",
    );
    expect(c1?.valid.version.version).toBe(1);
    expect(c1?.valid.until).toBe(C1_V2_LIVE.approvedAt);
  });

  it("keeps history up to the date only, newest first", () => {
    const at = new Date("2026-10-15T00:00:00+02:00");
    const c1 = rulesValidAt(versions, at).find((r) => r.key === "C1");
    expect(c1?.valid.version.version).toBe(2);
    expect(c1?.valid.until).toBeNull();
    expect(c1?.history.map((h) => h.version.version)).toEqual([2, 1]);
    expect(c1?.history.map((h) => h.from)).toEqual([C1_V2_LIVE.approvedAt, C1_V1_LIVE.createdAt]);
  });

  it("leaves out drafts and pending versions, which never ran", () => {
    const b2 = rulesValidAt(versions, new Date("2026-10-20T12:00:00+02:00")).find(
      (r) => r.key === "B2",
    );
    expect(b2?.history.map((h) => h.version.version)).toEqual([1]);
  });

  it("leaves out a rule that was not live yet at the date", () => {
    expect(rulesValidAt(versions, new Date("2026-10-05T00:00:00+02:00")).map((r) => r.key)).toEqual(
      ["C1"],
    );
  });
});

describe("versionChanges", () => {
  it("names changed parameters, condition and variables", () => {
    expect(versionChanges(B2, B2_V2)).toEqual(["pep_min 100,000 CZK → 50,000 CZK"]);
    expect(versionChanges(C1_V1, C1_V2)).toEqual(["variables"]);
    expect(versionChanges(A1, { ...A1, condition: "true" })).toEqual(["condition"]);
  });
});
