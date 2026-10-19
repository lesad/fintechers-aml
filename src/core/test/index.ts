export { loc } from "./loc";
export { T } from "./ids/app-ids";

// `db.ts` (`testDb` / `resetDb`) is deliberately NOT re-exported here. Client
// Components (e.g. guestbook-form.tsx) import `T` from this barrel, and Next's
// webpack client bundler statically resolves every module reachable from the
// barrel's index — even code that never runs in the browser. `postgres` pulls in
// Node builtins (`tls`, `net`, ...) with no browser shim, so bundling it breaks
// any page using this barrel client-side. Same exception as `@/supabase`
// (ADR-0007/ADR-0009/ADR-0016): import the node-only helper via the deep alias,
// `@/test/db`.
//
// `renderWithIntl` (the `NextIntlClientProvider` test render helper) is likewise
// deep-only — it pulls `@testing-library/react`, which shouldn't reach a client
// bundle. Import it via `@/test/render`.
