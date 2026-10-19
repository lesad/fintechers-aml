import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"] });

export default defineConfig({
  schema: "./src/core/db/schema/*",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // DDL/generation uses the direct (non-pooling) connection; falls back to POSTGRES_URL, then local.
    url:
      process.env.POSTGRES_URL_NON_POOLING ??
      process.env.POSTGRES_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
