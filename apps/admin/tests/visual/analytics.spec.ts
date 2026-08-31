// Phase 14 Remediation #4 — visual baseline spec for AnalyticsPage
// Page: apps/admin/src/pages/AnalyticsPage.tsx
//
// Captures the default cohort states plus each linked evidence surface at
// tablet and desktop widths (820, 1024, 1280, 1440, 1920). Operator runs
//   pnpm exec playwright test tests/visual/analytics.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import { test, expect, waitForVisualSettled } from './_fixtures';

const ROUTE = '/analytics';

test.describe('AnalyticsPage', () => {
  for (const width of [820, 1024, 1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`analytics-default-${width}.png`, {
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
        await expect(page.getByText('Loading cohort analysis…')).toBeVisible();
        await expect(page).toHaveScreenshot(`analytics-loading-${width}.png`, {
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
        await expect(page.getByText('No cohort data')).toBeVisible();
        await expect(page).toHaveScreenshot(`analytics-empty-${width}.png`, {
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
        await expect(page.getByText('Cohort analysis unavailable')).toBeVisible();
        await expect(page).toHaveScreenshot(`analytics-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('retention evidence', async ({ page }) => {
        await page.goto(`${ROUTE}?tab=churn`);
        await waitForVisualSettled(page);
        await expect(page.getByRole('link', { name: 'Ana Reyes' })).toBeVisible();
        await expect(page).toHaveScreenshot(`analytics-retention-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('quality evidence', async ({ page }) => {
        await page.goto(`${ROUTE}?tab=quality`);
        await waitForVisualSettled(page);
        await expect(page.getByRole('link', { name: 'Mia Santos' })).toBeVisible();
        await expect(page).toHaveScreenshot(`analytics-quality-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('commission evidence', async ({ page }) => {
        await page.goto(`${ROUTE}?tab=commission`);
        await waitForVisualSettled(page);
        await expect(page.getByText('Current live rate 13%')).toBeVisible();
        await expect(page).toHaveScreenshot(`analytics-commission-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
