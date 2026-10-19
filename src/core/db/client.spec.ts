import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/db";

// Smoke test for the integration harness itself: proves env loading, the
// server-only stub alias, the postgres pool, and the database are all wired.
describe("db client", () => {
  afterAll(async () => {
    await db.$client.end();
  });

  it("connects to the database", async () => {
    const result = await db.execute(sql`select 1 as ok`);

    expect(result[0]?.ok).toBe(1);
  });
});
