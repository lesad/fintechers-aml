import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./src",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI runs `pnpm start` — a production build, every route already compiled —
  // so it can use half the machine. A local run is `pnpm dev`, where each route
  // is compiled by Turbopack on first hit; Playwright's default (~5 workers on
  // a laptop) puts enough of them in flight at once that individual navigations
  // stall past any assertion timeout. The symptom is a rotating cast of one to
  // four failures per run, all passing in isolation, none reproducible in a real
  // browser. Measured downstream: 5 workers → 2-4 failures every run; 2 workers
  // → all green, and *faster* wall-clock, because the compiles stop fighting
  // each other. Raising assertion timeouts does not fix it.
  workers: process.env.CI ? "50%" : 2,
  // Local runs stay terse — one line, plus failures. CI keeps the HTML artifact.
  reporter: process.env.CI ? [["dot"], ["github"], ["html", { open: "never" }]] : "dot",
  use: {
    baseURL,
    trace: "on-first-retry",
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? "pnpm start" : "pnpm dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: process.env.CI ? 300_000 : 120_000,
        // Next dev and Tailwind write compile timings and deprecation notices to
        // stderr, which Playwright pipes by default — dozens of lines per run.
        // Keep them in CI, where they are the only diagnostics available.
        stdout: "ignore",
        stderr: process.env.CI ? "pipe" : "ignore",
      },
});
