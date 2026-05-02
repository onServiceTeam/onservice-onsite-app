// MED-N86 + MED-N96 fix verified.
//
// MED-N86: customer self-assign of a specific provider via
// POST /bookings/:id/assign skipped the matching algorithm and
// conflict-of-interest checks. Cash-off-app collusion vector
// (customer pays in cash for a discount, completes via app to
// launder the relationship). Pre-fix: silently accepted. Post-fix:
// per audit option (b), still allowed but every customer
// self-assign now logs a security_events row with kind:
// 'customer_self_assigned_provider' so the bypass-detection cron
// + admin Compliance dashboard can pattern-match.
//
// MED-N96: GET /providers/:id was UNAUTHENTICATED and returned
// the provider's full profile including precise lat/long, city,
// province, full first+last name. Combined with portfolio photo
// EXIF (preserved by D01 SSE-KMS pipeline), this enabled
// reverse-geocoding to the provider's specific address by anonymous
// internet browsers. Post-fix: requires authentication. Customers/
// providers/admins can all view (no role restriction) — every
// legitimate "browse a provider's profile" flow already has a
// logged-in actor via search/matching surfaces.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const BOOKING_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/booking.routes.ts'),
  'utf8',
);
const PROVIDER_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/provider.routes.ts'),
  'utf8',
);

describe('MED-N86 — booking.routes /:id/assign logs customer self-assign', () => {
  it('detects customer self-assign branch (isAdmin=false && isBookingOwner=true)', () => {
    expect(BOOKING_ROUTES).toMatch(/MED-N86 fix/);
    expect(BOOKING_ROUTES).toMatch(/if \(!isAdmin && isBookingOwner\) \{/);
  });

  it('calls logSecurityEvent with kind: customer_self_assigned_provider', () => {
    expect(BOOKING_ROUTES).toMatch(/kind: 'customer_self_assigned_provider'/);
    expect(BOOKING_ROUTES).toMatch(/eventType: 'suspicious_activity'/);
  });

  it('captures bookingId + providerId in the metadata', () => {
    expect(BOOKING_ROUTES).toMatch(/bookingId: id,/);
    expect(BOOKING_ROUTES).toMatch(/providerId,/);
    // Both inside the same try/catch as the MED-N86 log call.
    expect(BOOKING_ROUTES).toMatch(/MED-N86 fix[\s\S]*?bookingId: id/);
  });

  it('is wrapped in try/catch — logging failure NEVER blocks the booking', () => {
    expect(BOOKING_ROUTES).toMatch(/MED-N86 fix[\s\S]{0,1500}try \{[\s\S]*?catch \(logErr\)/);
    expect(BOOKING_ROUTES).toMatch(/Logging failure must NOT block the booking flow/);
  });

  it('admin assignment is NOT logged (legitimate path)', () => {
    // The if-guard requires `!isAdmin` so admin assigns flow through
    // unlogged. The 403 ownership check still applies.
    const block = BOOKING_ROUTES.match(/router\.post\(\s*'\/:id\/assign'[\s\S]*?(?=router\.[a-z]+\()/);
    expect(block).not.toBeNull();
    // The MED-N86 log block only fires inside the !isAdmin branch.
    expect(block![0]).toMatch(/if \(!isAdmin && isBookingOwner\) \{[\s\S]{0,200}logSecurityEvent/);
  });
});

describe('MED-N96 — provider.routes GET /:id requires auth', () => {
  it('the route now declares authMiddleware', () => {
    // Anchor on the route signature so we don't accidentally match
    // a different GET '/:id' handler.
    const block = PROVIDER_ROUTES.match(/router\.get\(\s*'\/:id',[\s\S]*?(?=router\.[a-z]+\(|export default|$)/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/authMiddleware,/);
  });

  it('handler signature uses AuthenticatedRequest', () => {
    const block = PROVIDER_ROUTES.match(/router\.get\(\s*'\/:id',[\s\S]*?(?=router\.[a-z]+\(|export default|$)/);
    expect(block![0]).toMatch(/async \(req: AuthenticatedRequest, res: Response/);
  });

  it('comment documents the MED-N96 reverse-geocoding rationale', () => {
    expect(PROVIDER_ROUTES).toMatch(/MED-N96 fix/);
    expect(PROVIDER_ROUTES).toMatch(/reverse-geocoding/);
  });

  it('the route still returns the same payload shape (regression guard for callers)', () => {
    const block = PROVIDER_ROUTES.match(/router\.get\(\s*'\/:id',[\s\S]*?(?=router\.[a-z]+\(|export default|$)/);
    expect(block![0]).toMatch(/services: services\.map/);
    expect(block![0]).toMatch(/portfolio: portfolio\.map/);
    expect(block![0]).toMatch(/sukiCount,/);
  });
});
