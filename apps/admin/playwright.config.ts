// Phase L MED-L05 fix — baseURL fallback now matches the actual vite
// dev port. Pre-fix: the fallback was http://localhost:5173 (vite's
// default) but apps/admin/vite.config.ts pins the dev server to
// 7382, so running `npx playwright test` locally without
// STAGING_ADMIN_URL set hit a closed port and every spec failed
// before the first assertion. Post-fix: fall back to the canonical
// dev port; STAGING_ADMIN_URL still wins for CI/staging.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./test-results",
  use: {
    baseURL: process.env.STAGING_ADMIN_URL ?? "http://localhost:7382",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  retries: 2,
  workers: 4,
});
