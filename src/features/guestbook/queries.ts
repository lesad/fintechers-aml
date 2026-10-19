import "server-only";
import { desc } from "drizzle-orm";

import { db, guestbook } from "@/db";

export type GuestbookEntry = typeof guestbook.$inferSelect;

export function listGuestbook(): Promise<GuestbookEntry[]> {
  return db.select().from(guestbook).orderBy(desc(guestbook.createdAt));
}

export async function createGuestbookEntry(input: {
  name: string;
  message: string;
}): Promise<void> {
  await db.insert(guestbook).values(input);
}
