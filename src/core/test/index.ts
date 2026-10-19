export { loc } from "./loc";

// `db.ts` (`testDb` / `resetDb`) is deliberately NOT re-exported here (ADR-0009): it pulls
// in `postgres`, which webpack would bundle into any client bundle reachable from this
// barrel. Import it via the deep alias, `@/test/db`. Same shape as the `@/supabase` exception.
