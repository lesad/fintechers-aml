import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Next.js loads .env.local automatically; node scripts do not (CLAUDE.md).
// .env.local wins over .env; real env vars always take precedence.
config({ path: [".env.local", ".env"] });

// Migrations run DDL — use the direct (non-pooling) connection, never the transaction pooler.
const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error("POSTGRES_URL_NON_POOLING or POSTGRES_URL is required");
}

const sql = postgres(connectionString, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "./supabase/migrations" });
await sql.end();

console.log("Migrations applied.");
