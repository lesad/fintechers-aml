import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/db";

import { createGuestbookEntry, listGuestbook } from "../queries";
import { insertGuestbookEntry } from "./fixtures";

// Canonical integration spec: it exercises the real data-access functions against
// the real database and writes no cleanup of its own — the global
// `beforeEach(resetDb)` in `integration-setup.ts` truncates first. See ADR-0016.
describe("guestbook queries (integration)", () => {
  afterAll(async () => {
    await db.$client.end();
  });

  it("writes a row that reads back through the query layer", async () => {
    await createGuestbookEntry({ name: "Ada", message: "Hello, world" });

    const rows = await listGuestbook();

    expect(rows).toHaveLength(1);
    // Also proves runtime `casing: "snake_case"`: created_at → createdAt.
    expect(rows[0]).toMatchObject({ name: "Ada", message: "Hello, world" });
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("lists newest first", async () => {
    await insertGuestbookEntry({ name: "Older", createdAt: new Date("2024-01-01T00:00:00Z") });
    await insertGuestbookEntry({ name: "Newer", createdAt: new Date("2024-06-01T00:00:00Z") });

    expect((await listGuestbook()).map((row) => row.name)).toEqual(["Newer", "Older"]);
  });

  it("starts empty — the previous tests' rows were truncated, not left behind", async () => {
    expect(await listGuestbook()).toEqual([]);
  });
});
