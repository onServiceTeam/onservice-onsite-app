// Phase 14 Remediation #4 — visual baseline spec for SystemSettingsPage
// Page: apps/admin/src/pages/SystemSettingsPage.tsx
//
// Captures operational states at tablet and desktop widths. Operator runs
//   pnpm exec playwright test tests/visual/system-settings.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import { test, expect, waitForVisualSettled } from './_fixtures';

const ROUTE = '/settings';

test.describe('SystemSettingsPage', () => {
  for (const width of [820, 1024, 1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`system-settings-default-${width}.png`, {
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
        await expect(page.getByLabel('Loading system settings')).toBeVisible();
        await expect(page).toHaveScreenshot(`system-settings-loading-${width}.png`, {
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
              body: JSON.stringify({
                success: true,
                data: { categories: [], settings: {} },
              }),
            });
          } else {
            route.continue();
          }
        });
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page).toHaveScreenshot(`system-settings-empty-${width}.png`, {
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
        await expect(page).toHaveScreenshot(`system-settings-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('review-change dialog', async ({ page }) => {
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await page.getByRole('button', { name: 'Edit setting nbi_expiry_warning_days' }).click();
        await page.getByLabel('Value for nbi_expiry_warning_days').fill('45');
        await page.getByLabel('Audit reason for nbi_expiry_warning_days').fill(
          'Align provider reminders with the approved compliance review window.',
        );
        await page.getByRole('button', { name: 'Review change' }).click();
        await expect(page.getByRole('dialog', { name: 'Confirm this setting change' })).toBeVisible();
        await expect(page).toHaveScreenshot(`system-settings-review-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
