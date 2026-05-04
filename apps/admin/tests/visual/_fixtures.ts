// Phase 37 — Playwright fixture that seeds an admin auth state via
// route-mocking /auth/me. Without this, every spec navigating to a
// protected route (everything except /login) gets redirected to the
// login page, which means visual baselines for 28 of 29 specs were
// captured of the LOGIN screen, not the target page (CRIT-PHASE37-01).
//
// The fixture also defaults every /api/v1/admin/** GET to a sensible
// shape so pages render their default state quickly. Per-test
// page.route() calls (in the loading/empty/error sub-tests) override
// this default.
//
// Usage in specs:
//   import { test, expect } from './_fixtures';

import { test as base, expect } from '@playwright/test';

const FAKE_ADMIN = {
  id: '00000000-0000-0000-0000-000000000099',
  email: 'visual-baselines@onservice.test',
  phone: '+639170000099',
  firstName: 'Visual',
  lastName: 'Baselines',
  role: 'super_admin',
  avatarUrl: null,
  isVerified: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  mustRotatePassword: false,
};

// Dashboard KPI shape — must match exactly the DashboardKpis interface
// in packages/api/src/services/admin-analytics.service.ts. Earlier
// version of this fixture had three field-name mismatches (camelCase
// drift) that surfaced as blank KPI cards on Dashboard baselines:
//   providerApprovals → pendingApprovals
//   todaysBookings    → todayBookings
//   staleBookings     → staleDisputes
const KPI_OBJECT = {
  revenue: 0, revenueTrendPct: 0,
  activeBookings: 0, pendingDisputes: 0, newSignups: 0,
  pendingApprovals: 0, todayBookings: 0, escalatedDisputes: 0,
  staleDisputes: 0, escrowBalance: 0, platformRevenue: 0,
  guaranteeFund: 0, guaranteeFundRunwayMonths: 0,
};

// Acquisition Funnel shape — Dashboard renders three steps (Registered,
// First Booking, Repeat Booking) and shows "Loading funnel..." text
// when funnel.data is null. Provide a real shape so the funnel cards
// render in baselines.
const FUNNEL_OBJECT = {
  registered: 0,
  firstBooking: 0,
  repeatBooking: 0,
};

// SystemSettings shape — page expects `data: { categories: [...],
// settings: { [cat]: PlatformSetting[] } }`. Categories below match
// CATEGORY_META in SystemSettingsPage.tsx so the sidebar shows real
// labels in baselines (commissions, fees, escrow, etc).
const SETTINGS_BUNDLE = {
  categories: [
    { category: 'commissions',  count: 0 },
    { category: 'fees',         count: 0 },
    { category: 'escrow',       count: 0 },
    { category: 'cancellation', count: 0 },
    { category: 'security',     count: 0 },
    { category: 'cache',        count: 0 },
  ],
  settings: {
    commissions: [], fees: [], escrow: [], cancellation: [],
    security: [], cache: [],
  },
};

// Cancellation policy shape — public read returns `data: { tiers,
// intro_text, ... }` (object, not array).
const CANCELLATION_POLICY_OBJECT = {
  version: 1,
  effective_from: '2026-01-01T00:00:00.000Z',
  tiers: [],
  intro_text: '',
  legal_disclaimer: '',
  provider_no_show_credit_php: 0,
  is_active: true,
};

// Financials sub-endpoints — Each tab calls its own endpoint with a
// distinct object shape. The default empty-list mock crashes pages
// that destructure `data.aging.map(...)` etc.
const FINANCIALS_OVERVIEW = {
  gmv: 0, revenue: 0, refunds: 0,
  netRevenue: 0, bookingsCompleted: 0, averageTicket: 0,
};
const FINANCIALS_ESCROW = {
  totalInEscrow: 0,
  aging: [],
  pendingReleaseList: [],
};
const FINANCIALS_PAYOUTS = {
  pendingCount: 0, pendingTotal: 0,
  todayCompletedCount: 0, todayCompletedTotal: 0,
  failedCount: 0, upcomingScheduled: 0,
  recentFailed: [],
};
const FINANCIALS_GUARANTEE = {
  currentBalance: 0, inflow30d: 0, outflow30d: 0, net30d: 0,
  avgMonthlyOutflow: 0, runwayMonths: null, needsReplenishment: false,
};
const FINANCIALS_BIR_OVERVIEW = {
  year: 2026, totalOutputVat: 0, totalVatPayable: 0,
  monthsFinalized: 0, monthlyReports: [], quarterlyBatches: [],
};

export const test = base.extend({
  page: async ({ page }, use) => {
    // 1. Hard-mock /auth/me so the auth-store hydrate() succeeds.
    await page.route('**/api/v1/auth/me', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: FAKE_ADMIN }),
        });
      } else {
        route.continue();
      }
    });

    // 2a. Public cancellation-policy endpoint lives outside /admin.
    await page.route('**/api/v1/settings/cancellation-policy', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: CANCELLATION_POLICY_OBJECT }),
        });
      } else {
        route.continue();
      }
    });

    // 2b. Default-mock every other admin-API GET. Dashboard KPI endpoint
    //    gets the object shape; everything else gets the empty paginated
    //    list shape.
    await page.route('**/api/v1/admin/**', (route) => {
      if (route.request().method() !== 'GET') {
        route.continue();
        return;
      }
      const url = route.request().url();
      let body: unknown;
      if (url.includes('/dashboard/kpis')) {
        body = { success: true, data: KPI_OBJECT };
      } else if (url.includes('/dashboard/acquisition-funnel')) {
        body = { success: true, data: FUNNEL_OBJECT };
      } else if (url.includes('/admin/financials/overview')) {
        body = { success: true, data: FINANCIALS_OVERVIEW };
      } else if (url.includes('/admin/financials/escrow')) {
        body = { success: true, data: FINANCIALS_ESCROW };
      } else if (url.includes('/admin/financials/payouts')) {
        body = { success: true, data: FINANCIALS_PAYOUTS };
      } else if (url.includes('/admin/financials/guarantee-fund')) {
        body = { success: true, data: FINANCIALS_GUARANTEE };
      } else if (url.includes('/admin/financials/bir-2307/overview')
              || url.includes('/admin/bir/overview')) {
        body = { success: true, data: FINANCIALS_BIR_OVERVIEW };
      } else if (url.match(/\/admin\/settings(\?|$)/)) {
        // /admin/settings (no path suffix) — bundle endpoint
        body = { success: true, data: SETTINGS_BUNDLE };
      } else if (url.includes('/admin/cancellation-policies') && url.match(/\/\d+($|\?)/)) {
        // /admin/cancellation-policies/:version — single object
        body = { success: true, data: CANCELLATION_POLICY_OBJECT };
      } else {
        body = {
          success: true,
          data: [],
          pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
          meta: { total: 0, unread: 0, page: 1, pageSize: 20 },
        };
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    // 3. Wait for networkidle after every goto so screenshots capture
    //    a settled state instead of a mid-fetch spinner. 3s timeout is
    //    enough for the React Query useQuery hooks to resolve against
    //    the synchronous fulfill above.
    const origGoto = page.goto.bind(page);
    page.goto = async (url, opts) => {
      const result = await origGoto(url, opts);
      try {
        await page.waitForLoadState('networkidle', { timeout: 3000 });
      } catch {
        /* some pages keep long-poll websockets open; screenshot
           algorithm has its own visual-stability check */
      }
      return result;
    };

    await use(page);
  },
});

export { expect };
