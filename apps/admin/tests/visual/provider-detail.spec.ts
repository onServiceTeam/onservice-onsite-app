// Phase 14 Remediation #4 — visual baseline spec for ProviderDetailPage
// Page: apps/admin/src/pages/ProviderDetailPage.tsx
//
// Captures core record states at desktop widths plus operations, notes, and staff
// workspaces at tablet widths. Operator runs
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
        await expect(page.getByRole('heading', { name: 'Cebu Home Care' })).toBeVisible();
        await expect(page.getByText('Cebu City, Cebu', { exact: true })).toBeVisible();
        await expect(page).toHaveScreenshot(`provider-detail-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
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
        await expect(page.getByRole('status')).toContainText('Loading provider…');
        await expect(page).toHaveScreenshot(`provider-detail-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
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

  for (const width of [820, 1024]) {
    test.describe(`tablet @${width}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test('tablet operations workspace', async ({ page }) => {
        await page.goto(ROUTE);
        await expect(page.getByRole('heading', { name: 'Cebu Home Care' })).toBeVisible();
        await expect(page.getByText('Mia Support')).toBeVisible();
        await expect(page).toHaveScreenshot(`provider-detail-tablet-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('tablet internal notes', async ({ page }) => {
        await page.goto(ROUTE);
        await page.getByRole('tab', { name: 'Notes' }).click();
        await expect(page.getByText('Customer callback completed. Evidence review remains open.')).toBeVisible();
        await expect(page).toHaveScreenshot(`provider-detail-notes-tablet-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('tablet provider team privacy and review state', async ({ page }) => {
        await page.goto(ROUTE);
        await page.getByRole('tab', { name: 'Staff' }).click();
        await expect(page.getByText('Joel Santos')).toBeVisible();
        await expect(page.getByText('Invite contact masked').first()).toBeVisible();
        await expect(page).toHaveScreenshot(`provider-detail-staff-tablet-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });
    });
  }
});
