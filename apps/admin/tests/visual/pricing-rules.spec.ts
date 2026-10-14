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

// Shape mirrors formatPricingRule() in packages/api/src/services/pricing.service.ts
// after the 2026-09-02 publication workflow (migration 165). The page reads
// publicationStatus/updatedAt/publish* on every row, so a row without them
// crashes the page. Migration 165 only allows isActive=true together with
// 'published' or 'legacy_active'; publishing sets updated_at = published_at.
const VISUAL_ADMIN_ID = '00000000-0000-0000-0000-000000000099';
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
  publicationStatus: 'published',
  priority: 20,
  platformSurgeShare: 0.5,
  description: 'Applies to confirmed bookings scheduled within six hours.',
  createdBy: VISUAL_ADMIN_ID,
  draftReason: 'Same-day Metro Cebu requests outnumber available providers.',
  publishedBy: VISUAL_ADMIN_ID,
  publishedAt: '2026-08-02T01:00:00.000Z',
  publishReason: 'Server preview confirmed the premium only applies to Metro Cebu.',
  retiredBy: null,
  retiredAt: null,
  retireReason: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T01:00:00.000Z',
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
        // Since db98bbb3 the page renders each rule twice: a card list hidden at
        // lg+ and a table shown at lg+. Every width here is >= lg (1024px), so
        // the rule must be visible in the table.
        await expect(page.getByRole('table').getByText('Same-day rush premium')).toBeVisible();
        // Empty-state copy changed on purpose in db98bbb3 (2026-09-02).
        await expect(page.getByText('No pricing rules match this view')).toHaveCount(0);
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
        // Empty-state copy changed on purpose in db98bbb3 (2026-09-02).
        await expect(page.getByText('No pricing rules match this view')).toBeVisible();
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
        // Error copy changed on purpose in aadfd2e6 (2026-09-04, Bug UX-1261 retry state).
        await expect(page.getByText('Pricing rules unavailable')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('.animate-pulse')).toHaveCount(0);
        await expect(page).toHaveScreenshot(`pricing-rules-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
        });
      });
    });
  }
});
