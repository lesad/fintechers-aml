import "server-only";
import { guestbook } from "@/db";
import { testDb } from "@/test/db";

// Unique per process, so default values never collide within a file.
let counter = 0;

/**
 * Canonical row builder: every column defaulted, so a spec spells out only the
 * values it asserts on. Inserts through `testDb` (not the app's `db`) and returns
 * the row. No cleanup — `resetDb` truncates between tests. See ADR-0016.
 */
export async function insertGuestbookEntry(overrides: Partial<typeof guestbook.$inferInsert> = {}) {
  const n = ++counter;
  const [row] = await testDb
    .insert(guestbook)
    .values({ name: `Visitor ${n}`, message: `Message ${n}`, ...overrides })
    .returning();
  return row!;
}
