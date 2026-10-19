import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "happy-dom",
          // `.test` = unit, `.spec` = integration, `.e2e` = Playwright (co-located taxonomy)
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
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.spec.{ts,tsx}"],
          setupFiles: ["./src/core/test/integration-setup.ts"],
          // Reseeds afterwards — see the file. The per-test truncation would
          // otherwise leave the database empty for whatever runs next.
          globalSetup: ["./src/core/test/integration-global.ts"],
          globals: true,
          fileParallelism: false,
          alias: {
            "server-only": path.join(dirname, "src/core/test/server-only-stub.ts"),
          },
        },
      },
      // Opt-in: `storybookTest` loads Storybook's main config at *config* time,
      // so including it unconditionally made every `vitest` invocation — even
      // `--project=unit` — boot Storybook. Measured here: ~2.2s of config-load
      // overhead on a run whose unit tests take 0.3s. `pnpm test:storybook` sets
      // the flag; `pnpm test:all` sets it too, so it still covers all three
      // projects (a `--project=storybook` run without the flag simply won't find
      // the project — that's what `test:storybook` is for).
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      ...(process.env.STORYBOOK_TEST
        ? [
            {
              extends: true as const,
              plugins: [storybookTest({ configDir: path.join(dirname, ".storybook") })],
              test: {
                name: "storybook",
                browser: {
                  enabled: true,
                  headless: true,
                  provider: playwright({}),
                  instances: [{ browser: "chromium" as const }],
                },
              },
            },
          ]
        : []),
    ],
  },
});
