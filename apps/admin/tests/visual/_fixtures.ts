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

// Dashboard/KPI shape — pages that destructure `data.field` need an
// object, not the empty array shape used by list endpoints.
const KPI_OBJECT = {
  revenue: 0, revenueTrendPct: 0,
  activeBookings: 0, pendingDisputes: 0, newSignups: 0,
  providerApprovals: 0, todaysBookings: 0, escalatedDisputes: 0,
  staleBookings: 0, escrowBalance: 0, platformRevenue: 0,
  guaranteeFund: 0, guaranteeFundRunwayMonths: 0,
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

    // 2. Default-mock every other admin-API GET. Dashboard KPI endpoint
    //    gets the object shape; everything else gets the empty paginated
    //    list shape.
    await page.route('**/api/v1/admin/**', (route) => {
      if (route.request().method() !== 'GET') {
        route.continue();
        return;
      }
      const url = route.request().url();
      const isKpiEndpoint = url.includes('/dashboard/kpis');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          isKpiEndpoint
            ? { success: true, data: KPI_OBJECT }
            : {
                success: true,
                data: [],
                pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
                meta: { total: 0, unread: 0, page: 1, pageSize: 20 },
              },
        ),
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
