# Admin visual baseline tests

Per Phase 14 Part 4 §"Gate D — Visual screenshots". Each catalogued admin page (Part 2A — 28 pages) gets a Playwright test here that captures all 4 required states (loading, empty, error, success) at the documented viewport widths and matches a baseline image.

## Population timeline

- **Dispatch 0:** This README only. Directory exists so Gate D's existence check passes; gate skips with informational message.
- **Dispatch 06:** Test infrastructure stood up (`pnpm exec playwright install chromium`, jest-axe wired).
- **Dispatch 07:** All 28 admin pages get baseline tests + designer-grade restyle. Baselines committed (Git LFS for PNGs).
- **Subsequent UI dispatches:** Baselines updated when intentional UI changes land.

## Baseline storage

Baseline PNGs live at `tests/visual/<page-name>/<state>.png`. Configure Git LFS:

```bash
git lfs track "apps/admin/tests/visual/baselines/**/*.png"
```

## How to add a new test

```ts
import { test, expect } from "@playwright/test";

test.describe("DashboardPage", () => {
  test("loading state matches baseline", async ({ page }) => {
    await page.route("**/api/v1/admin/dashboard*", route => route.fulfill({
      status: 200, body: JSON.stringify({ data: { /* empty */ } })
    }));
    await page.goto("/dashboard");
    await expect(page).toHaveScreenshot("dashboard-loading.png");
  });

  test("success state matches baseline", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForSelector('[data-testid="kpi-revenue"]');
    await expect(page).toHaveScreenshot("dashboard-success.png");
  });

  // empty + error states similarly
});
```

## Required states per Part 2A

Every page must capture: loading, empty (where applicable), error, success. Plus viewport variants per Design Contract V2 §10: 1920, 1440, 1280, 768.
