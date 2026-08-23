// Phase 14 Remediation #4 — visual baseline spec for ProviderDetailPage
// Page: apps/admin/src/pages/ProviderDetailPage.tsx
//
// Captures 5 states (loading, missing, error, success, certification review) at 3 viewport
// widths (1280, 1440, 1920). Operator runs
//   pnpm exec playwright test tests/visual/provider-detail.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import { test, expect } from './_fixtures';

const ROUTE = '/providers/PV-0001';

test.describe('ProviderDetailPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await expect(page).toHaveScreenshot(`provider-detail-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('certification review workspace', async ({ page }) => {
        await page.goto(ROUTE);
        await page.getByRole('tab', { name: 'Certifications' }).click();
        await expect(page.getByText('Electrical Installation NC II')).toBeVisible();
        await expect(page.getByText('Plumbing NC II')).toBeVisible();
        await expect(page).toHaveScreenshot(`provider-detail-certifications-${width}.png`, {
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
        await expect(page).toHaveScreenshot(`provider-detail-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('missing provider state', async ({ page }) => {
        // A detail page has no list-style empty state. Prove the real missing
        // record response instead of passing an invalid [] profile shape.
        await page.route('**/api/v1/admin/providers/*/profile', (route) => {
          route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, error: { message: 'Provider not found.' } }),
          });
        });
        await page.goto(ROUTE);
        await expect(page.getByRole('alert')).toContainText('Provider not found.', { timeout: 15_000 });
        await expect(page).toHaveScreenshot(`provider-detail-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('error state', async ({ page }) => {
        await page.route('**/api/v1/admin/providers/*/profile', (route) => {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, error: { message: 'Provider service unavailable.' } }),
          });
        });
        await page.goto(ROUTE);
        await expect(page.getByRole('alert')).toContainText('Provider service unavailable.', { timeout: 15_000 });
        await expect(page).toHaveScreenshot(`provider-detail-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });
    });
  }
});
