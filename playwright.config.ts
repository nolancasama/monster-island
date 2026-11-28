import { existsSync, statSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Machine-wide testing workflow: ~/.claude/testing/TESTING_WORKFLOW.md (tiers, lock, ports).
const worktree = existsSync(".git") && statSync(".git").isFile();
const port = Number(process.env.PREVIEW_PORT ?? (worktree ? 4276 : 4176));
const baseURL = process.env.BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: Number(process.env.PW_WORKERS ?? 1),
  retries: process.env.CI ? 1 : 0,
  // MI_LONG_TIMEOUT raises every test limit (e.g. for SwiftShader compatibility runs).
  timeout: Number(process.env.MI_LONG_TIMEOUT ?? 180_000),
  reporter: "line",
  globalSetup: "./tests/support/global-setup.ts",
  use: {
    ...devices["Desktop Chrome"],
    channel: "chromium",
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: {
      args: process.env.CB_SWIFTSHADER === "1"
        ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : []
    }
  },
  webServer: process.env.BASE_URL ? undefined : {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [
    { name: "functional", testDir: "./tests/e2e" },
    { name: "visual", testDir: "./tests/visual" },
    { name: "perf", testDir: "./tests/perf" },
    { name: "soak", testDir: "./tests/soak" }
  ]
});
