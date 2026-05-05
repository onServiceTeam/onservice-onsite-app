// BUG-PHASE106-01 — live provider GPS streaming was a half-built
// feature shipped with a misleading customer-facing promise.
//
// Pre-fix:
//   - apps/mobile/app/customer/booking/tracker.tsx subscribed to
//     `booking:${id}:location` socket events and rendered a marker
//     for providerLocation when received.
//   - apps/mobile/app/provider/job/active.tsx captured location ONCE
//     at the "I've Arrived" transition; no watchPositionAsync loop,
//     no socket emit during provider_en_route.
//   - apps/mobile/src/lib/i18n.ts defined `provider.gps.broadcasting`
//     ('Sharing your location with the customer while you travel.') —
//     never consumed anywhere.
//   - apps/mobile/app/customer/safety-and-support.tsx promised
//     "Real-time tracking — See your provider's location on the map
//     while they're on the way to you." — a specific promise the
//     app cannot keep.
//
// Fix at v1.0:
//   - Soften the safety-and-support copy to "Live status updates"
//     and describe what actually works (push notifications + status
//     pill changes + booking-address map).
//   - Remove the dead `provider.gps.broadcasting` i18n key.
//   - Leave the customer-side socket subscription in place (harmless
//     — listens for events that never fire — and v1.1 only needs to
//     land the producer side).
//   - Document the gap as section 32 of LAUNCH-LIMITATIONS.md so
//     operators have a script when customers ask "why isn't the
//     provider's pin moving?".

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SAFETY = readFileSync(
  resolve(__dirname, '../app/customer/safety-and-support.tsx'),
  'utf8',
);
const I18N = readFileSync(
  resolve(__dirname, '../src/lib/i18n.ts'),
  'utf8',
);
const LAUNCH_LIMITATIONS = readFileSync(
  resolve(__dirname, '../../../LAUNCH-LIMITATIONS.md'),
  'utf8',
);
const TRACKER = readFileSync(
  resolve(__dirname, '../app/customer/booking/tracker.tsx'),
  'utf8',
);

describe('BUG-PHASE106-01 — half-built GPS streaming feature: misleading copy + dead i18n key gone', () => {
  it('BUG-PHASE106-01 — pre-fix "See your provider\'s location on the map" promise is gone from safety screen', () => {
    expect(SAFETY).not.toMatch(/See your provider's location on the map while they're on the way to you/);
  });

  it('BUG-PHASE106-01 — replaced with truthful "Live status updates" framing', () => {
    expect(SAFETY).toMatch(/title: 'Live status updates'/);
    expect(SAFETY).toMatch(/push notifications/i);
  });

  it('BUG-PHASE106-01 — dead i18n key provider.gps.broadcasting removed', () => {
    expect(I18N).not.toMatch(/provider\.gps\.broadcasting/);
  });

  it('BUG-PHASE106-01 — LAUNCH-LIMITATIONS.md documents the gap as section 32', () => {
    expect(LAUNCH_LIMITATIONS).toMatch(/Live provider GPS streaming pulled for v1\.0/);
    expect(LAUNCH_LIMITATIONS).toMatch(/Phase 106 audit/);
  });

  it('BUG-PHASE106-01 — customer-side socket subscription left in place (so v1.1 only needs producer)', () => {
    // Regression guard — make sure we did NOT remove the existing
    // listener. If a future audit removes it, v1.1 implementation
    // would be incomplete without this client wire too.
    expect(TRACKER).toMatch(/socket\.on\(`booking:\$\{bookingId\}:location`/);
  });
});
