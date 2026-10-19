# `src/core/test` — test harness (not tests)

Shared setup + helpers for the Vitest unit project. The test files themselves are co-located next to source — in a `__tests__/` subfolder once a directory has 3+ of them.

| File         | Used by          | What                                                                              |
| ------------ | ---------------- | --------------------------------------------------------------------------------- |
| `setup.ts`   | unit (happy-dom) | global unit setup (`vite.config.ts` → unit project)                               |
| `render.tsx` | unit (happy-dom) | re-exports `render` + `screen`, the single seam for app-wide providers. Deep-only |
| `ids/`       | unit + app       | the portable `data-testid` system (`@/test/ids`)                                  |

Every test is a unit test (`*.test.ts(x)`, happy-dom, no I/O). The `*.spec.ts(x)` integration project went with the database (ADR-0025) — reintroduce both together if a server comes back.

There is no `@/test` root barrel; every member is a deep import. `render.tsx` must stay out of one because it pulls `@testing-library/react`, which has no business in an app bundle: `import { render } from "@/test/render"`. Components import test ids from `@/test/ids`.

**Row builders** (`src/features/<name>/__tests__/fixtures.ts`) remain the convention for any fixture a feature's tests share — they just build plain objects now rather than inserting rows.
