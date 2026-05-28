// Phase 14 Remediation #4 — visual baseline spec for FinancialsPage
// Page: apps/admin/src/pages/FinancialsPage.tsx
//
// Captures 4 states (loading, empty, error, success) at 3 viewport
// widths (1280, 1440, 1920). Operator runs
//   pnpm exec playwright test tests/visual/financials.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import { test, expect } from './_fixtures';

const ROUTE = '/financials';

test.describe('FinancialsPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await page.goto(ROUTE);
        await expect(page).toHaveScreenshot(`financials-default-${width}.png`, {
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
        await expect(page).toHaveScreenshot(`financials-loading-${width}.png`, {
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
        await expect(page).toHaveScreenshot(`financials-empty-${width}.png`, {
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
        await expect(page).toHaveScreenshot(`financials-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      // Phase 38c — explicit per-tab captures so visual-diff catches
      // regressions on the Escrow / Payouts / Guarantee Fund /
      // Reconciliation / BIR Reports / Receipts tabs (the original
      // "default render" only captured the Overview tab). Only at 1280
      // to keep the baseline set manageable.
      if (width === 1280) {
        for (const tab of ['Escrow', 'Payouts', 'Guarantee Fund', 'Reconciliation', 'BIR Reports', 'Receipts']) {
          test(`tab: ${tab}`, async ({ page }) => {
            await page.goto(ROUTE);
            // Tabs are role="tab" inside an inline-flex tab strip
            // (see TABS map in FinancialsPage). Using getByRole with
            // role 'tab' avoids collision with the same label in the
            // sidebar (e.g. /payouts route).
            await page.getByRole('tab', { name: tab }).click();
            await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
            await expect(page).toHaveScreenshot(
              `financials-tab-${tab.toLowerCase().replace(/ /g, '-')}-${width}.png`,
              { fullPage: true, maxDiffPixelRatio: 0.01 },
            );
          });
        }
      }
    });
  }
});
