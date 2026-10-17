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
          // 2026-10-18: the request alert banner (MarketplaceAlertBanner,
          // added 2026-10-14) is not part of this page's empty state. Given
          // this settings object instead of an alert list, its check failed
          // and it showed "Request alerts could not be checked" about a
          // second after the page settled, so the screenshot had the banner
          // or not depending on how fast the run was. Its requests go to the
          // shared fixture's "no open alerts" answer instead.
          if (route.request().url().includes('/api/v1/admin/marketplace-health/')) {
            void route.fallback();
            return;
          }
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
        // 2026-10-18: wait for the error itself. The page retries once before
        // it shows the error, and its loading skeleton has no "loading" text,
        // so waitForVisualSettled alone let a re-capture store the skeleton
        // as the "error" picture. With every admin GET failing, the request
        // alert banner reports its own failed check too.
        await expect(page.getByRole('heading', { name: 'System Settings could not load' })).toBeVisible();
        await expect(page.getByLabel('Loading system settings')).toHaveCount(0);
        await expect(page.getByText('Request alerts could not be checked. Retrying automatically.')).toBeVisible();
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
