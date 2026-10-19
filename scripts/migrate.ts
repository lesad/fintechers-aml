import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { existsSync } from "node:fs";
import postgres from "postgres";

// Next.js loads .env.local automatically; node scripts do not (CLAUDE.md).
// .env.local wins over .env; real env vars always take precedence.
config({ path: [".env.local", ".env"] });

// Migrations run DDL — use the direct (non-pooling) connection, never a pooling proxy.
const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error("POSTGRES_URL_NON_POOLING or POSTGRES_URL is required");
}

const migrationsFolder = "./db/migrations";
// drizzle-kit writes the journal with the first generated migration; until then there is nothing to apply.
if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
  console.log("No migrations yet.");
  process.exit(0);
}

const sql = postgres(connectionString, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder });
await sql.end();

console.log("Migrations applied.");
