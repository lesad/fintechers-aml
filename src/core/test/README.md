# `src/core/test` — test harness (not tests)

Shared setup + helpers for the Vitest projects. The test files themselves are co-located next to source — in a `__tests__/` subfolder once a directory has 3+ of them.

| File                   | Used by            | What                                                                                                                                |
| ---------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `setup.ts`             | unit (happy-dom)   | global unit setup (`vitest.config.ts` → unit project)                                                                               |
| `integration-setup.ts` | integration (node) | loads `.env.local` so `POSTGRES_URL` is present before `env.ts` validates, then registers the global `beforeEach(resetDb)`          |
| `db.ts`                | integration        | `testDb` fixture connection + `resetDb()`, which truncates every table in the schema; **refuses non-loopback hosts** (it TRUNCATEs) |
| `server-only-stub.ts`  | integration        | aliased for `server-only` (which throws under node), so `src/core/db/*` can be imported under Vitest                                |
| `render.tsx`           | unit (happy-dom)   | `renderWithIntl(ui)` — renders inside `NextIntlClientProvider`; re-exports `screen` + `messages`. Deep-only via `@/test/render`     |

Taxonomy: `*.test.ts(x)` unit · `*.spec.ts(x)` integration. Details in `CLAUDE.md` → Testing.

## Integration isolation

`resetDb()` runs as a **global `beforeEach`** — specs never write their own cleanup, and the table list is derived from `@/db/schema`, so adding a table can't silently leave it un-truncated. That is what makes the suite order-independent despite `fileParallelism: false`.

Per-test `BEGIN`/`ROLLBACK` would be stricter and faster, but it needs the code under test to share one pinned connection with the test. The app's `@/db` client is a `max: 10` pool, so a rollback wrapper rolls back on a different connection than the one the query ran on — it isolates nothing, and a spec written against it has to bypass the query layer and assert in raw SQL. Truncation exercises the real functions instead. Revisit only if the suite needs to run in parallel, which would want a database-per-worker. See ADR-0016.

**Row builders live with the feature they belong to** (`src/features/<name>/__tests__/fixtures.ts`), insert through `testDb`, and default every column — so a spec spells out only the values it asserts on. `insertGuestbookEntry` is the canonical example.

There is no `@/test` root barrel; every member is a deep import. Client Components import test ids from `@/test/ids`. `db.ts` must stay out of any barrel a Client Component can reach: webpack statically bundles everything reachable from a barrel, and `postgres` needs Node builtins (`tls`, `net`) that do not exist in the browser. Integration tests import it as `import { testDb } from "@/test/db"`. `render.tsx` is deep-only for the same reason (it pulls `@testing-library/react`): `import { renderWithIntl } from "@/test/render"`.
