// MED-N145 / MED-N161 / MED-N163 / MED-N164 / MED-N167 fixes verified.
// Mix of source-shape (route gating + rate limit wiring) + behavior
// (status partition invariant).

import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  ACTIVE_BOOKING_STATUSES,
  COMPLETED_BOOKING_STATUSES,
  CANCELLED_BOOKING_STATUSES,
  ALL_BOOKING_STATUSES,
  VALID_TRANSITIONS,
} from '../src/types/booking.types';

const CATALOG_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/catalog.routes.ts'),
  'utf8',
);
const NOTIF_TEMPLATE_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/notification-template.routes.ts'),
  'utf8',
);
const SERVICE_AREA_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/service-area.routes.ts'),
  'utf8',
);
const WEBHOOK_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/webhook.routes.ts'),
  'utf8',
);

describe('MED-N145 — booking status partition invariant', () => {
  it('MED-N145 — every BookingStatus appears in exactly one bucket', () => {
    const allBuckets = [
      ...ACTIVE_BOOKING_STATUSES,
      ...COMPLETED_BOOKING_STATUSES,
      ...CANCELLED_BOOKING_STATUSES,
    ];
    const set = new Set(allBuckets);
    // No duplicates across the three buckets.
    expect(set.size).toBe(allBuckets.length);
    // Every status known to VALID_TRANSITIONS must appear.
    for (const s of Object.keys(VALID_TRANSITIONS)) {
      expect(set.has(s as never)).toBe(true);
    }
    // Round-trip via ALL_BOOKING_STATUSES.
    expect(ALL_BOOKING_STATUSES.length).toBe(set.size);
  });

  it('MED-N145 — metrics.service uses the canonical sets, not inline strings', () => {
    const metrics = readFileSync(
      resolve(__dirname, '../src/services/metrics.service.ts'),
      'utf8',
    );
    expect(metrics).toMatch(/ACTIVE_BOOKING_STATUSES/);
    expect(metrics).toMatch(/COMPLETED_BOOKING_STATUSES/);
    expect(metrics).toMatch(/CANCELLED_BOOKING_STATUSES/);
    // Old inline status list should no longer be present in the SQL.
    expect(metrics).not.toMatch(/'requested','quoted','matched','payment_pending','paid','provider_en_route','provider_arrived','in_progress'/);
  });
});

describe('MED-N161 — catalog mutations now require super_admin', () => {
  it('MED-N161 — requireSuperAdmin function defined and used in mutation handlers', () => {
    expect(CATALOG_ROUTES).toMatch(/function requireSuperAdmin/);
    // Check that requireSuperAdmin is called in each mutation handler.
    // POST/PUT/DELETE handlers should now use it.
    const requireSuperAdminCount = (CATALOG_ROUTES.match(/requireSuperAdmin\(req\)/g) ?? []).length;
    // 7 mutation handlers (categories POST/PUT, subcategories POST/PUT/DELETE, addons POST/PUT/DELETE).
    expect(requireSuperAdminCount).toBeGreaterThanOrEqual(7);
  });

  it('MED-N161 — GET /admin/subcategories/:id/addons keeps requireAdmin (read access)', () => {
    // The GET handler is still requireAdmin (read OK for junior admin).
    // Verify by finding the GET handler's anchor and checking the call.
    const getAnchor = CATALOG_ROUTES.indexOf("'/admin/subcategories/:id/addons'");
    expect(getAnchor).toBeGreaterThan(0);
    const block = CATALOG_ROUTES.slice(getAnchor, getAnchor + 800);
    expect(block).toMatch(/requireAdmin\(req\)/);
  });
});

describe('MED-N167 — notification-template DELETE requires super_admin', () => {
  it('MED-N167 — requireSuperAdmin is called inside the DELETE handler', () => {
    expect(NOTIF_TEMPLATE_ROUTES).toMatch(/function requireSuperAdmin/);
    const deleteAnchor = NOTIF_TEMPLATE_ROUTES.indexOf("router.delete(");
    expect(deleteAnchor).toBeGreaterThan(0);
    const block = NOTIF_TEMPLATE_ROUTES.slice(deleteAnchor, deleteAnchor + 800);
    expect(block).toMatch(/requireSuperAdmin\(req\)/);
  });
});

describe('MED-N163 — service-area waitlist has rate limit', () => {
  it('MED-N163 — POST /waitlist uses waitlistRateLimit middleware', () => {
    expect(SERVICE_AREA_ROUTES).toMatch(/waitlistRateLimit/);
    expect(SERVICE_AREA_ROUTES).toMatch(/express-rate-limit/);
    // Ensure the rate limit middleware is wired into the POST handler
    // (i.e., placed in the router.post args before the async handler).
    const postBlock = SERVICE_AREA_ROUTES.slice(
      SERVICE_AREA_ROUTES.indexOf("router.post(\n  '/waitlist'"),
    );
    const handlerSlice = postBlock.slice(0, 400);
    expect(handlerSlice).toMatch(/waitlistRateLimit/);
  });
});

describe('MED-N164 — PayMongo webhook has rate limit', () => {
  it('MED-N164 — POST /paymongo uses webhookRateLimit middleware', () => {
    expect(WEBHOOK_ROUTES).toMatch(/webhookRateLimit/);
    const postBlock = WEBHOOK_ROUTES.slice(
      WEBHOOK_ROUTES.indexOf("router.post(\n  '/paymongo'"),
    );
    const handlerSlice = postBlock.slice(0, 400);
    expect(handlerSlice).toMatch(/webhookRateLimit/);
  });
});
