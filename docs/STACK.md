# Stack versions & docs (context7)

> **Intended use:** the single source of truth for pinned dependency versions and their resolved **context7** IDs. **Skip `resolve-library-id`** — call `query-docs` directly with the ID below; append `/<tag>` for version-locked docs. Update this table when bumping a dep. Never guess versions/APIs — look them up here first.

| Library                     | Version          | context7 ID (query-docs)                                          |
| --------------------------- | ---------------- | ----------------------------------------------------------------- |
| Next.js                     | 16.2.4           | `/vercel/next.js` (tag `v16.2.2`)                                 |
| React                       | 19.2.5           | `/react/react` (tag `v19.2.7`) · concepts `/reactjs/react.dev`    |
| React Compiler              | 1.0.0            | via `/reactjs/react.dev` (topic: React Compiler)                  |
| next-intl                   | 4.11.0           | `/amannn/next-intl`                                               |
| Tailwind CSS                | 4.2.4            | `/tailwindlabs/tailwindcss.com`                                   |
| Drizzle ORM / kit           | 0.45.2 / 0.31.10 | `/drizzle-team/drizzle-orm-docs`                                  |
| Supabase platform / CLI     | —                | `/supabase/supabase` · `/supabase/cli`                            |
| @supabase/ssr               | 0.10.2           | `/supabase/ssr`                                                   |
| supabase-js                 | 2.105.3          | `/supabase/supabase`                                              |
| zod                         | 4.4.3            | `/websites/zod_dev_v4`                                            |
| react-hook-form / resolvers | 7.75.0 / 5.2.2   | `/react-hook-form/react-hook-form` · `/react-hook-form/resolvers` |
| Playwright                  | 1.59.1           | `/microsoft/playwright` (tag `v1.58.2`)                           |
| Vitest                      | 4.1.5            | `/vitest-dev/vitest` (tag `v4.1.6`)                               |
| Storybook                   | 10.3.6           | `/storybookjs/storybook` (tag `v10.2.9`)                          |

Runtime: Node ≥24, pnpm 10.30.2. UI utils (docs rarely needed — resolve on demand): @base-ui/react 1.4.1, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.5.0, lucide-react 1.14.0.
