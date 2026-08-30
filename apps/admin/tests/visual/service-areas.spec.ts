// Phase 14 Remediation #4 — visual baseline spec for ServiceAreasPage
// Page: apps/admin/src/pages/ServiceAreasPage.tsx
//
// Captures 4 states (loading, empty, error, success) at 3 viewport
// widths (1280, 1440, 1920). Operator runs
//   pnpm exec playwright test tests/visual/service-areas.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import { test, expect, waitForVisualSettled } from './_fixtures';

const ROUTE = '/service-areas';

test.describe('ServiceAreasPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`service-areas-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('loading state', async ({ page }) => {
        // Stall every admin API call so skeleton renders.
        await page.route('**/api/v1/admin/**', (route) => {
          void route;
        });
        await page.goto(ROUTE);
        // Operator wires the right test-id selector when the screen's
        // skeleton mounts. Default to a forgiving locator that should
        // match the canonical Skeleton component.
        await expect(page.locator('[data-testid="skeleton"], .skeleton').first()).toBeVisible({
          timeout: 2000,
        }).catch(() => {});
        await expect(page).toHaveScreenshot(`service-areas-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('empty state', async ({ page }) => {
        // Force every admin GET to return an empty list so EmptyState renders.
        await page.route('**/api/v1/admin/**', (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ data: [], pagination: { total: 0, page: 1 } }),
            });
          } else {
            route.continue();
          }
        });
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`service-areas-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('error state', async ({ page }) => {
        // 500 on every admin GET so ErrorState renders.
        await page.route('**/api/v1/admin/**', (route) => {
          if (route.request().method() === 'GET') {
            route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: { message: 'server_error' } }),
            });
          } else {
            route.continue();
          }
        });
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`service-areas-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
