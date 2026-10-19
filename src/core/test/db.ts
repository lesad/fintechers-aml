import "server-only";
import { getTableName, isTable, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

/**
 * Resolve the Postgres URL for integration tests and refuse anything that is not
 * loopback. `resetDb` TRUNCATEs, so a misconfigured `POSTGRES_URL` here is data
 * loss, not a failed assertion — the check is the whole reason this indirection
 * exists. Prefers the direct connection; the pooled one works too.
 */
function localUrl(): string {
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "POSTGRES_URL_NON_POOLING (or POSTGRES_URL) is not set. Integration tests need the local Supabase stack — run `pnpm db:start`.",
    );
  }
  const { hostname } = new URL(url);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error(
      `Refusing to run integration tests against non-loopback host "${hostname}" — resetDb() truncates every table. Point POSTGRES_URL at the local stack (postgresql://postgres:postgres@127.0.0.1:54322/postgres).`,
    );
  }
  return url;
}

/**
 * Fixture connection for integration specs. Deliberately separate from the app's
 * `@/db` client so setup/teardown never reuses the module-cached pool the code
 * under test is exercising. `casing` must match `src/core/db/client.ts` or
 * camelCase schema keys are emitted as column identifiers and fail.
 */
export const testDb = drizzle(postgres(localUrl(), { max: 1, prepare: false }), {
  casing: "snake_case",
});

// Derived from the schema, so adding a table can't silently leave it un-reset. The
// `unknown` widening is for the ejected skeleton, where `@/db/schema` exports a
// non-table placeholder and `isTable` is the only thing that filters it out.
const TABLES = Object.values<unknown>(schema)
  .filter(isTable)
  .map((table) => `"${getTableName(table)}"`);

/**
 * Truncate every table in the schema. Registered as a global `beforeEach` in
 * `integration-setup.ts` — specs never write their own cleanup. See ADR-0016.
 */
export async function resetDb(): Promise<void> {
  // Empty after `pnpm eject:examples` leaves the schema a bare placeholder.
  if (TABLES.length === 0) return;
  await testDb.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} CASCADE`));
}
