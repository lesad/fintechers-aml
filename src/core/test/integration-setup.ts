import { config } from "dotenv";
import { beforeEach } from "vitest";

config({ path: ".env.local" });

// Imported after dotenv so POSTGRES_URL is set before the connection is built.
const { resetDb } = await import("./db");

// Global, so no spec can forget cleanup and no spec can leak into the next file.
beforeEach(resetDb);
