import react from "@vitejs/plugin-react";
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
          // `.test` = unit, `.spec` = integration (co-located taxonomy)
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
    ],
  },
});
