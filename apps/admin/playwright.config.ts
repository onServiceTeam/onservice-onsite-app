import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./test-results",
  use: {
    baseURL: process.env.STAGING_ADMIN_URL ?? "http://localhost:5173",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  retries: 2,
  workers: 4,
});
