// D38 Milestone 3: visual spec for MarketplacePage (/marketplace, Waiting now
// tab) and the marketplace alert banner.
// Page: apps/admin/src/pages/MarketplacePage.tsx
// Banner: apps/admin/src/components/MarketplaceAlertBanner.tsx
//
// States: Waiting now default (one red wait, one quote waiting for the
// customer), loading, empty and error; the other four tabs with data; and the
// alert banner with an open alert; at 768, 1280, 1440 and 1920 wide. The clock
// is fixed so "Waiting 12 min" is stable.
// Baselines are NOT captured yet (no browser session in the session that
// wrote this spec). Capture them with
//   npx playwright test tests/visual/marketplace.spec.ts --update-snapshots
// from apps/admin/.

import type { Page, Route } from '@playwright/test';
import { test, expect, waitForVisualSettled } from './_fixtures';

const ROUTE = '/marketplace?tab=waiting';
const FIXED_NOW = new Date('2026-10-14T02:00:00.000Z');

type Mode = 'success' | 'empty' | 'error' | 'loading';

function minutesBefore(minutes: number): string {
  return new Date(FIXED_NOW.getTime() - minutes * 60_000).toISOString();
}

function openRequest(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    bookingId: 'BK-VISUAL-0001',
    categoryName: 'Aircon',
    subcategoryName: 'Aircon cleaning',
    barangay: 'Lahug',
    city: 'Cebu City',
    urgency: 'normal',
    scheduledAt: null,
    createdAt: minutesBefore(12),
    waitingSince: minutesBefore(12),
    waitMinutes: 12,
    waitingOn: 'providers',
    severity: 'red',
    round: 1,
    maxRounds: 3,
    notified: 4,
    viewed: 1,
    responded: 0,
    notifiedTotal: 4,
    viewedTotal: 1,
    respondedTotal: 0,
    liveQuotes: 0,
    totalQuotes: 0,
    declinedQuotes: 0,
    budgetMinCentavos: 150_000,
    budgetMaxCentavos: 250_000,
    budgetUnknown: false,
    opsReviewAt: null,
    opsReviewReason: null,
    openAlertIds: ['ALERT-VISUAL-0001'],
    customer: { id: 'CU-0001', displayName: 'Ana R.' },
    ...overrides,
  };
}

const OPEN_REQUESTS = [
  openRequest({}),
  openRequest({
    bookingId: 'BK-VISUAL-0002',
    categoryName: 'Plumbing',
    subcategoryName: 'Leak repair',
    barangay: 'Banilad',
    city: 'Mandaue',
    createdAt: minutesBefore(40),
    waitingSince: minutesBefore(40),
    waitMinutes: 40,
    waitingOn: 'customer',
    severity: 'none',
    responded: 1,
    respondedTotal: 1,
    liveQuotes: 1,
    totalQuotes: 1,
    budgetMinCentavos: null,
    budgetMaxCentavos: null,
    budgetUnknown: true,
    openAlertIds: [],
    customer: { id: 'CU-0002', displayName: 'Ben S.' },
  }),
];

const OPEN_ALERTS = [
  {
    id: 'ALERT-VISUAL-0001',
    bookingId: 'BK-VISUAL-0001',
    kind: 'request_waiting_red',
    severity: 'red',
    round: 1,
    anchorAt: minutesBefore(12),
    thresholdMinutes: 10,
    details: { notified: 4, viewed: 1 },
    raisedAt: minutesBefore(2),
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolution: null,
    serviceName: 'Aircon cleaning',
    barangay: 'Lahug',
    city: 'Cebu City',
    currentWaitMinutes: 12,
  },
];

const LOST_ROWS = [{
  bookingId: 'BK-VISUAL-0003', reason: 'notified_none_viewed', closedBy: 'system', status: 'cancelled_by_admin',
  cancellationReason: null, categoryName: 'Electrical', subcategoryName: 'Outlet repair', barangay: 'Pajo',
  city: 'Lapu-Lapu', createdAt: minutesBefore(4_000), closedAt: minutesBefore(100), rounds: 1, invited: 3,
  viewed: 0, quotes: 0, declinedQuotes: 0, budgetMinCentavos: 80_000, budgetMaxCentavos: 120_000,
  budgetUnknown: false, estimatedValueCentavos: 100_000,
}];

const RESPONSE_TIME_ROWS = [
  { categoryName: 'Aircon', requests: 6, responded: 5, noResponse: 1, p50Minutes: 9.5, p90Minutes: 42, within30Pct: 66.7 },
  { categoryName: 'Plumbing', requests: 2, responded: 0, noResponse: 2, p50Minutes: null, p90Minutes: null, within30Pct: 0 },
];

const PROVIDER_ROWS = [{
  providerId: 'PV-0001', providerName: 'Mia Home Care', providerStatus: 'approved', isAvailable: true,
  phone: '+63 9XX XXX 7788', contactMasked: true, invites: 8, notified: 6, viewed: 6, responded: 2,
  viewedRate: 0.75, responseRate: 0.25, medianResponseMinutes: 8.5, quotesAccepted: 1,
  lastActiveAt: minutesBefore(60),
}];

const COVERAGE = {
  threshold: 3,
  areas: [{ id: 'AREA-1', name: 'Cebu City', status: 'active' }, { id: 'AREA-2', name: 'Mandaue', status: 'soft_launch' }],
  categories: [{ id: 'CAT-1', name: 'Aircon' }, { id: 'CAT-2', name: 'Plumbing' }],
  cells: [
    { areaId: 'AREA-1', categoryId: 'CAT-1', approvedProviders: 5, responsiveProviders: 4, requests30d: 12, belowThreshold: false },
    { areaId: 'AREA-1', categoryId: 'CAT-2', approvedProviders: 2, responsiveProviders: 1, requests30d: 3, belowThreshold: true },
    { areaId: 'AREA-2', categoryId: 'CAT-1', approvedProviders: 1, responsiveProviders: 0, requests30d: 2, belowThreshold: true },
    { areaId: 'AREA-2', categoryId: 'CAT-2', approvedProviders: 0, responsiveProviders: 0, requests30d: 0, belowThreshold: true },
  ],
};

const OTHER_TABS = [
  { tab: 'lost', path: 'lost-opportunities', expected: 'Providers notified, none opened it',
    body: { success: true, data: LOST_ROWS, meta: { summary: { total: 1, byReason: { notified_none_viewed: 1 }, estimatedValueCentavos: 100_000, withoutBudget: 0 }, total: 1, page: 1, pageSize: 25, from: '2026-09-15', to: '2026-10-14' } } },
  { tab: 'response-times', path: 'response-times', expected: 'Median first quote (p50)',
    body: { success: true, data: RESPONSE_TIME_ROWS, meta: { overall: { requests: 8, responded: 5, noResponse: 3, p50Minutes: 9.5, p90Minutes: 42, within30Pct: 50 }, from: '2026-09-15', to: '2026-10-14', groupBy: 'category' } } },
  { tab: 'providers', path: 'providers', expected: 'Mia Home Care',
    body: { success: true, data: PROVIDER_ROWS, meta: { total: 1, page: 1, pageSize: 25, sort: 'invites', from: '2026-09-15', to: '2026-10-14' } } },
  { tab: 'coverage', path: 'coverage', expected: 'Needs recruiting', body: { success: true, data: COVERAGE } },
] as const;

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockMarketplaceApi(page: Page, mode: Mode, options: { alerts?: boolean } = {}): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.route('**/api/v1/admin/marketplace-health/alerts**', async (route) => {
    const alerts = options.alerts ? OPEN_ALERTS : [];
    await fulfillJson(route, {
      success: true,
      data: alerts,
      meta: {
        openCount: alerts.length,
        unacknowledgedCount: alerts.length,
        openRedCount: alerts.length,
        amberMinutes: 5,
        redMinutes: 10,
      },
    });
  });
  await page.route('**/api/v1/admin/marketplace-health/open-requests**', async (route) => {
    if (mode === 'loading') {
      await new Promise<void>(() => {});
      return;
    }
    if (mode === 'error') {
      await fulfillJson(route, { success: false, error: { message: 'Marketplace insights unavailable.' } }, 500);
      return;
    }
    await fulfillJson(route, {
      success: true,
      data: mode === 'success' ? OPEN_REQUESTS : [],
      meta: { amberMinutes: 5, redMinutes: 10, maxRounds: 3, generatedAt: FIXED_NOW.toISOString() },
    });
  });
}

test.describe('MarketplacePage', () => {
  for (const width of [768, 1280, 1440, 1920]) {
    test.describe(`@${width}`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('default render', async ({ page }) => {
        await mockMarketplaceApi(page, 'success');
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByText('Waiting 12 min')).toBeVisible();
        await expect(page.getByText('Red: over 10 min')).toBeVisible();
        const overflow = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
        await expect(page).toHaveScreenshot(`marketplace-default-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('loading state', async ({ page }) => {
        await mockMarketplaceApi(page, 'loading');
        await page.goto(ROUTE);
        await expect(page.getByText('Loading waiting requests...')).toBeVisible();
        await expect(page).toHaveScreenshot(`marketplace-loading-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('empty state', async ({ page }) => {
        await mockMarketplaceApi(page, 'empty');
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByText('No quote requests are open right now')).toBeVisible();
        await expect(page).toHaveScreenshot(`marketplace-empty-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      test('error state', async ({ page }) => {
        await mockMarketplaceApi(page, 'error');
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByText('Waiting requests could not be loaded')).toBeVisible();
        await expect(page).toHaveScreenshot(`marketplace-error-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });

      for (const other of OTHER_TABS) {
        test(`${other.tab} tab`, async ({ page }) => {
          await mockMarketplaceApi(page, 'success');
          await page.route(`**/api/v1/admin/marketplace-health/${other.path}**`, async (route) => {
            await fulfillJson(route, other.body);
          });
          await page.goto(`/marketplace?tab=${other.tab}`);
          await waitForVisualSettled(page);
          await expect(page.locator('main').getByText(other.expected, { exact: true }).locator('visible=true').first()).toBeVisible();
          const overflow = await page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }));
          expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
          await expect(page).toHaveScreenshot(`marketplace-${other.tab}-${width}.png`, {
            fullPage: true,
            maxDiffPixelRatio: 0.01,
          });
        });
      }

      test('alert banner with an open red alert', async ({ page }) => {
        await mockMarketplaceApi(page, 'success', { alerts: true });
        await page.goto(ROUTE);
        await waitForVisualSettled(page);
        await expect(page.getByText('1 quote request alert open')).toBeVisible();
        await page.getByRole('button', { name: 'Show alerts' }).click();
        await expect(page.getByText('No quote after 10 min')).toBeVisible();
        await expect(page).toHaveScreenshot(`marketplace-alert-banner-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    });
  }
});
