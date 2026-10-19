import { execSync } from "node:child_process";

/**
 * Reseeds the database once the integration run is over.
 *
 * `integration-setup.ts` registers a global `beforeEach(resetDb)` that truncates
 * every table (ADR-0016), so a finished suite leaves the database **empty** and
 * the next thing to read it silently gets nothing — a dev server, a `next build`
 * prerendering from `generateStaticParams`, or an e2e run.
 *
 * A `globalSetup` teardown rather than a second command chained after vitest in
 * `package.json`, for two reasons: it runs whether the suite passed or failed —
 * the failing run is exactly the one you want the database restored after — and
 * it cannot mask vitest's exit code, which `vitest run …; pnpm db:seed` would,
 * because a chained command's status becomes the script's.
 *
 * `scripts/seed.ts` applies `supabase/seed.sql`, which must stay idempotent.
 */
export function teardown() {
  execSync("pnpm -s db:seed", { stdio: "inherit" });
}
