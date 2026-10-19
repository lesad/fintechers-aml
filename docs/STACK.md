# Stack versions & docs (context7)

> **Intended use:** the single source of truth for pinned dependency versions and their resolved **context7** IDs. **Skip `resolve-library-id`** — call `query-docs` directly with the ID below; append `/<tag>` for version-locked docs. Update this table when bumping a dep. Never guess versions/APIs — look them up here first.

| Library                     | Version        | context7 ID (query-docs)                                          |
| --------------------------- | -------------- | ----------------------------------------------------------------- |
| Vite                        | 8.0.10         | `/vitejs/vite`                                                    |
| @vitejs/plugin-react        | 6.0.1          | `/vitejs/vite-plugin-react`                                       |
| React                       | 19.2.5         | `/react/react` (tag `v19.2.7`) · concepts `/reactjs/react.dev`    |
| React Compiler              | 1.0.0          | via `/reactjs/react.dev` (topic: React Compiler)                  |
| Tailwind CSS                | 4.2.4          | `/tailwindlabs/tailwindcss.com`                                   |
| zod                         | 4.4.3          | `/websites/zod_dev_v4`                                            |
| react-hook-form / resolvers | 7.75.0 / 5.2.2 | `/react-hook-form/react-hook-form` · `/react-hook-form/resolvers` |
| Vitest                      | 4.1.5          | `/vitest-dev/vitest` (tag `v4.1.6`)                               |

Runtime: Node ≥24, pnpm 10.30.2. UI utils (docs rarely needed — resolve on demand): clsx 2.1.1, tailwind-merge 3.5.0 (behind `cn()`). Build plumbing: @tailwindcss/vite 4.2.4, @rolldown/plugin-babel 0.2.4 + babel-plugin-react-compiler 1.0.0 (how the compiler is wired — see ADR-0025).

Rules engine (`engine/`, ADR-0024): JDK 25 (Gradle toolchain), Kotlin 2.4.21, Gradle 9.8.1, Spring Boot 4.1.1 (JDBC, Liquibase, Jackson 3), PostgreSQL 17, `dev.cel:cel` 0.14.0 (CEL for rules), `com.spandigital:cel2sql4j` 0.2.7 (CEL filters to SQL), Testcontainers for tests. Versions live in `engine/build.gradle.kts`.

Next.js, next-intl, Drizzle and `postgres` were removed in ADR-0025; the database now lives behind the Kotlin engine (ADR-0024).
