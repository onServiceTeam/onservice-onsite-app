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

// Customer 360 profile shape — CustomerDetailPage hits
// /admin/customers/:id and destructures profile.fullName etc. The
// sub-tabs (bookings/payments/disputes/referrals/activity) hit
// separate endpoints which return arrays; only the top-level GET
// needs the object shape.
const CUSTOMER_PROFILE = {
  id: 'CU-0001', firstName: 'Visual', lastName: 'Baseline',
  fullName: 'Visual Baseline', phone: '+639170000001',
  email: 'visual@onservice.test', avatarUrl: null,
  isVerified: true, isActive: true,
  lastLoginAt: '2026-05-04T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  lifetimeBookings: 0, lifetimeSpent: 0,
  averageRatingGiven: null, totalReviewsGiven: 0,
  addresses: [], sukiProviders: [],
};

// Provider 360 profile shape — ProviderDetailPage hits
// /admin/providers/:id and destructures provider fields. Same pattern
// as customer.
const PROVIDER_PROFILE = {
  id: 'PV-0001', userId: 'U-0001',
  fullName: 'Visual Provider', businessName: 'Visual Provider Co.',
  phone: '+639180000001', email: 'provider@onservice.test',
  avatarUrl: null, status: 'approved', tier: 'verified',
  rating: 0, totalReviews: 0, totalJobs: 0,
  serviceRadiusKm: 15, isAvailable: true,
  city: 'Boracay', province: 'Aklan',
  latitude: 11.97, longitude: 121.93,
  createdAt: '2026-01-01T00:00:00.000Z',
  approvedAt: '2026-01-15T00:00:00.000Z',
  // Sub-fields some sub-pages destructure
  totalEarnings: 0, lifetimeRevenue: 0, walletBalance: 0,
  pendingPayouts: 0, services: [], schedule: [], portfolio: [],
  certifications: [
    {
      id: 'CERT-0001', name: 'Electrical Installation NC II', issuingBody: 'TESDA',
      certificateNumber: 'TESDA-EI-1001', issuedDate: '2025-01-15', expiryDate: '2030-01-15',
      isVerified: true, verifiedAt: '2025-02-01T00:00:00.000Z', hasDocument: true,
      documentUrl: '/api/v1/admin/providers/PV-0001/certifications/CERT-0001/document',
      createdAt: '2025-01-15T00:00:00.000Z',
    },
    {
      id: 'CERT-0002', name: 'Plumbing NC II', issuingBody: 'TESDA',
      certificateNumber: 'TESDA-PL-1002', issuedDate: '2026-03-10', expiryDate: '2031-03-10',
      isVerified: false, verifiedAt: null, hasDocument: true,
      documentUrl: '/api/v1/admin/providers/PV-0001/certifications/CERT-0002/document',
      createdAt: '2026-03-10T00:00:00.000Z',
    },
    {
      id: 'CERT-0003', name: 'Air Conditioning Servicing NC II', issuingBody: 'TESDA',
      certificateNumber: 'TESDA-AC-1003', issuedDate: '2021-05-20', expiryDate: '2025-05-20',
      isVerified: false, verifiedAt: null, hasDocument: true,
      documentUrl: '/api/v1/admin/providers/PV-0001/certifications/CERT-0003/document',
      createdAt: '2021-05-20T00:00:00.000Z',
    },
    {
      id: 'CERT-0004', name: 'Basic Occupational Safety and Health', issuingBody: 'DOLE',
      certificateNumber: null, issuedDate: '2026-06-01', expiryDate: null,
      isVerified: false, verifiedAt: null, hasDocument: false, documentUrl: null,
      createdAt: '2026-06-01T00:00:00.000Z',
    },
  ],
  notes: [],
};

// Booking detail shape — BookingDetailPage hits /admin/bookings/:id.
// Address is nested { full, barangay, city, province } not flat.
// Pre-fix the flat shape made the page render ", ," because the
// outer string was truthy but inner .full/.barangay/.city/.province
// were all undefined (BUG-PHASE39-03).
const BOOKING_DETAIL = {
  id: 'BK-0001', bookingNumber: 'BK-0001',
  customer: null, provider: null,
  status: 'confirmed', escrowStatus: 'released',
  servicePrice: 0, serviceFee: 0, totalAmount: 0,
  scheduledAt: '2026-05-04T00:00:00.000Z',
  address: null,  // explicit null so the EmptyState branch fires
  description: '', categoryId: 'CAT-1', categoryName: 'Cleaning',
  subcategoryId: null, subcategoryName: null,
  paymentMethod: null, paymentIntentId: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-04T00:00:00.000Z',
};

// Dispute detail shape — DisputeDetailPage hits /admin/disputes/:id.
const DISPUTE_DETAIL = {
  id: 'DSP-0001', bookingId: 'BK-0001',
  customerId: 'CU-0001', providerId: 'PV-0001',
  customerName: 'Visual Customer', providerName: 'Visual Provider',
  type: 'service_quality', status: 'open',
  description: 'Visual baseline test dispute',
  resolution: null, resolutionNotes: null,
  refundAmount: null, refundType: null,
  assignedAdminId: null, escalatedAt: null,
  createdAt: '2026-05-04T00:00:00.000Z',
  updatedAt: '2026-05-04T00:00:00.000Z',
  messages: [], evidence: [],
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

    // 2a-bis. Other non-/admin endpoints called directly from pages:
    //   /catalog/**       — CatalogPage
    //   /disputes         — DisputesPage list
    //   /payouts          — PayoutsPage list
    //   /staff/**         — StaffRolesPage
    // All return safe empty payloads. Per-test page.route still
    // overrides for loading/empty/error states.
    const NON_ADMIN_PATTERNS = [
      '**/api/v1/catalog/**',
      '**/api/v1/disputes',
      '**/api/v1/disputes?**',
      '**/api/v1/payouts',
      '**/api/v1/payouts?**',
      '**/api/v1/staff/**',
    ];
    for (const pattern of NON_ADMIN_PATTERNS) {
      await page.route(pattern, (route) => {
        if (route.request().method() !== 'GET') {
          route.continue();
          return;
        }
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [],
            pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
          }),
        });
      });
    }

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
      } else if (url.match(/\/admin\/customers\/[^/]+(\?|$)/) && !url.includes('/customers/CU-0001/')) {
        // /admin/customers/:id (no path suffix) — profile object
        body = { success: true, data: CUSTOMER_PROFILE };
      } else if (url.match(/\/admin\/providers\/[^/]+\/profile/)) {
        body = { success: true, data: PROVIDER_PROFILE };
      } else if (url.match(/\/admin\/providers\/[^/]+(\?|$)/) && !url.match(/\/providers\/[^/]+\//)) {
        body = { success: true, data: PROVIDER_PROFILE };
      } else if (url.match(/\/admin\/bookings\/[^/]+(\?|$)/) && !url.match(/\/bookings\/[^/]+\//)) {
        body = { success: true, data: BOOKING_DETAIL };
      } else if (url.match(/\/admin\/disputes\/[^/]+(\?|$)/) && !url.match(/\/disputes\/[^/]+\//)) {
        body = { success: true, data: DISPUTE_DETAIL };
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
