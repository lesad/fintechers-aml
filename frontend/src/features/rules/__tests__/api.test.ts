import { afterEach, describe, expect, it, vi } from "vitest";

import {
  explainRule,
  fetchRules,
  formatCzk,
  groupByKey,
  RuleRejectedError,
  saveRule,
} from "../api";
import { A1, B2, B2_V2, C1_V1, C1_V2, json, SEEDED } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("fetchRules", () => {
  it("parses the engine's shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(SEEDED)),
    );
    const rules = await fetchRules();
    expect(rules).toHaveLength(4);
    expect(rules[2]?.variables[2]?.window).toEqual({ kind: "relative", from: "PT0S", to: "PT6H" });
  });

  it("rejects an unknown grain", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([{ ...SEEDED[0], grain: "weekly" }])),
    );
    await expect(fetchRules()).rejects.toThrow();
  });
});

describe("saveRule", () => {
  const {
    id: _id,
    version: _v,
    status: _s,
    createdAt: _c,
    explanation: _e,
    explanationModel: _m,
    ...fields
  } = B2_V2;
  const body = { ...fields, author: "J. Novák" };

  it("returns the saved draft", async () => {
    const fetch = vi.fn(async () => json(B2_V2, 201));
    vi.stubGlobal("fetch", fetch);
    await expect(saveRule(body)).resolves.toMatchObject({ id: 12, status: "draft" });
    expect(fetch).toHaveBeenCalledWith("/api/rules", expect.objectContaining({ method: "POST" }));
  });

  it("raises the engine's reason on a rejected save", async () => {
    const detail = "rule B2, condition: undeclared reference to 'tx.direcion'";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ status: 400, detail }, 400)),
    );
    const error = await saveRule(body).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RuleRejectedError);
    expect((error as Error).message).toBe(detail);
  });

  it("falls back to the status when a 409 has no detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 409 })),
    );
    await expect(saveRule(body)).rejects.toThrow("HTTP 409");
  });
});

describe("groupByKey", () => {
  it("groups versions by key, keys alphabetical, newest version first", () => {
    const groups = groupByKey([C1_V1, B2, C1_V2, A1]);
    expect(groups.map((g) => g.key)).toEqual(["A1", "B2", "C1"]);
    expect(groups[2]?.versions.map((v) => v.version)).toEqual([2, 1]);
  });
});

describe("formatCzk", () => {
  it("formats an amount as CZK", () => {
    expect(formatCzk(50_000)).toBe("50,000 CZK");
  });
});

describe("explainRule", () => {
  const body = { ...B2, name: B2.name, author: "J. Novák" };

  it("posts the rule to the explanation endpoint", async () => {
    const fetch = vi.fn(async () => json({ explanation: "Flags it.", model: "m" }));
    vi.stubGlobal("fetch", fetch);
    expect(await explainRule(body)).toEqual({ explanation: "Flags it.", model: "m" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/rules/explanation",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("a model failure carries the engine's reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ status: 502, detail: "try again" }, 502)),
    );
    await expect(explainRule(body)).rejects.toEqual(new RuleRejectedError("try again"));
  });
});
