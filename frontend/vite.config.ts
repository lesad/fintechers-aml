import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    // The Vite equivalent of Next's `reactCompiler: true`. `@vitejs/plugin-react` v6
    // transforms JSX with oxc and no longer takes a `babel` option, so the compiler
    // is wired as a Rolldown Babel preset instead — hence the `@rolldown/plugin-babel`
    // + `babel-plugin-react-compiler` pair. It still handles all memoization, so
    // `useMemo` / `useCallback` / `memo` stay banned (CLAUDE.md → React Compiler).
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  server: {
    // The Kotlin engine (engine/, `./gradlew bootRun`) serves /api on 8080 by default.
    proxy: { "/api": process.env.ENGINE_URL ?? "http://127.0.0.1:8080" },
  },
  resolve: {
    // Vite reads the `paths` map from tsconfig.json, so `@/…` aliases are
    // declared in exactly one place for both the app build and Vitest.
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "happy-dom",
          // `.test` = unit. `.spec` (integration, Postgres) went with the database.
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/core/test/setup.ts"],
          globals: true,
          pool: "threads",
          // `isolate: false` shares one module registry across every file in a
          // worker, so two files mocking the *same* module with different
          // factories collide — whichever registered first wins for both. It
          // only breaks once worker assignment puts the two files together, so
          // it passes locally and fails in CI with a stack trace pointing into
          // the other file. Measured downstream; not worth the startup saving.
          isolate: true,
          fileParallelism: true,
        },
      },
    ],
  },
});
