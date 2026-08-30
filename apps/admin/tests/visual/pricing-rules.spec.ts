// Phase 14 Remediation #4 — visual baseline spec for PricingRulesPage
// Page: apps/admin/src/pages/PricingRulesPage.tsx
//
// Captures 4 states (loading, empty, error, success) at 3 viewport
// widths (1280, 1440, 1920). Operator runs
//   pnpm exec playwright test tests/visual/pricing-rules.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import type { Page, Route } from '@playwright/test';
import { test, expect, waitForVisualSettled } from './_fixtures';

const ROUTE = '/pricing-rules';
const API_ROUTE = '**/api/v1/admin/pricing-rules?**';

const PRICING_RULE = {
  id: 'PRICE-0001',
  name: 'Same-day rush premium',
  type: 'rush',
  multiplier: 1.35,
  rushHoursThreshold: 6,
  holidayDate: null,
  peakStartTime: null,
  peakEndTime: null,
  peakDaysOfWeek: null,
  categoryId: null,
  serviceAreaId: 'AREA-CEBU',
  isActive: true,
  priority: 20,
  platformSurgeShare: 0.5,
  description: 'Applies to confirmed bookings scheduled within six hours.',
  createdAt: '2026-08-01T00:00:00.000Z',
};

function fulfill(route: Route, data: unknown[], total = data.length): void {
  void route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data,
      pagination: { page: 1, pageSize: 20, total, totalPages: total > 0 ? 1 : 0 },
    }),
  });
}

async function mockPricingRules(page: Page, data: unknown[]): Promise<void> {
  await page.route(API_ROUTE, (route) => fulfill(route, data));
}

test.describe('PricingRulesPage', () => {
  for (const width of [1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await mockPricingRules(page, [PRICING_RULE]);
        await page.goto(ROUTE);
        await expect(page.getByText('Same-day rush premium')).toBeVisible();
        await expect(page.getByText('No pricing rules yet.')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`pricing-rules-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('loading state', async ({ page }) => {
        await page.route(API_ROUTE, (route) => {
          void route;
        });
        await page.goto(ROUTE);
        await expect(page.locator('.animate-pulse').first()).toBeVisible();
        await expect(page).toHaveScreenshot(`pricing-rules-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('empty state', async ({ page }) => {
        await mockPricingRules(page, []);
        await page.goto(ROUTE);
        await expect(page.getByText('No pricing rules yet.')).toBeVisible();
        await expect(page).toHaveScreenshot(`pricing-rules-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });

      test('error state', async ({ page }) => {
        await page.route(API_ROUTE, (route) => {
          void route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'server_error' } }),
          });
        });
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByText('Failed to load pricing rules.')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('.animate-pulse')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`pricing-rules-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });
    });
  }
});
