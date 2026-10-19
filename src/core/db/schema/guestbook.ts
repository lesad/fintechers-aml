import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Public guestbook — the canonical example table. camelCase keys map to snake_case
// columns via `casing: "snake_case"`, set in BOTH drizzle.config.ts (migration
// generation) and the runtime drizzle() client (src/core/db/client.ts).
export const guestbook = pgTable("guestbook", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  message: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
