import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

// Next.js loads .env.local automatically; node scripts do not (CLAUDE.md).
config({ path: [".env.local", ".env"] });

const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error("POSTGRES_URL_NON_POOLING or POSTGRES_URL is required");
}

// Same file `supabase db reset` applies, so there is one seed source, not two.
// Keep it idempotent (delete-then-insert the rows it owns): this runs on its own
// after integration tests, with no reset in front of it.
const seed = await readFile("./supabase/seed.sql", "utf8");

const sql = postgres(connectionString, { max: 1 });
await sql.unsafe(seed);
await sql.end();

console.log("Seed applied.");
