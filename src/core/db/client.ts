import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";

// POSTGRES_URL is the pooled (transaction-mode) connection — prepared statements must be off.
const queryClient = postgres(env.POSTGRES_URL, { max: 10, prepare: false });
// `casing: "snake_case"` must be set here (runtime) too — drizzle.config.ts's casing
// only governs migration generation. Without it, queries emit camelCase JS keys as
// column identifiers (e.g. "createdAt") and fail against the snake_case columns.
export const db = drizzle(queryClient, { casing: "snake_case" });
