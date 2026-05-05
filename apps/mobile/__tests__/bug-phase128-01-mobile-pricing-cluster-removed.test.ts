// BUG-PHASE128-01 — apps/mobile had a 4-file dead cluster:
//   apps/mobile/src/stores/pricing.store.ts          (115 lines)
//   apps/mobile/src/services/pricing.service.ts      (59 lines)
//   apps/mobile/src/services/rebooking.service.ts    (55 lines)
//   apps/mobile/src/services/slot-waitlist.service.ts (45 lines)
//
// All three services were ONLY consumed by pricing.store.ts; the store
// itself had ZERO consumers across all 84 screens / 43 customer + 41
// provider routes. The cluster covered three v1.1+ features — surge
// pricing preview, rebooking suggestions, and slot waitlist — that
// were never wired into a screen. Phase 126 removed the matching
// navigation routes (CUSTOMER.WAITLIST, REBOOKING, SLOT_WAITLIST,
// REBOOKING_SETUP, BOOKING_TRACKER), so the consumer-side door was
// already shut; this phase removes the now-orphaned producer side.
//
// Same dead-code pattern as Phases 103 (provider checklist
// INITIAL_SECTIONS), 107 (portfolio imageUrl useState), 110
// (navigate.tsx ETA styles), 122 (tip.service dead branches), 126
// (navigation.ts dead route entries). In all six cases: a feature
// was removed/replaced/never-built and scaffolding was left behind.
//
// API side preserved (regression guard): the matching backend routes
// (`/bookings/pricing-preview`, `/bookings/upcoming-holidays`,
//  `/bookings/{id}/rebooking-suggestions`,
//  `/bookings/history/rebookable`, `/bookings/slot-waitlist`) STAY
// alive — they're tested, may be admin-consumed, and are the exact
// surface a v1.1 mobile re-introduction will call. If a v1.1 feature
// genuinely needs the mobile client back, add the file AND its
// consuming screen in the same change — file-without-consumer is
// what we're cleaning up.
//
// Verification before deletion (2026-05-05):
//   1. `from '@/stores/pricing.store'`     across apps/mobile/{app,src}: 0 hits
//   2. `from '@/services/pricing.service'` across apps/mobile/{app,src}: 0 non-self hits
//   3. `from '@/services/rebooking.service'` across apps/mobile/{app,src}: 0 non-self hits
//   4. `from '@/services/slot-waitlist.service'` across apps/mobile/{app,src}: 0 non-self hits
//   5. By-symbol grep for getPricingPreview, getRebookingSuggestions,
//      joinSlotWaitlist, fetchPricingPreview, usePricingStore — all
//      0 hits outside the deleted files.

import { existsSync } from 'fs';
import { resolve } from 'path';

const REPO_MOBILE_SRC = resolve(__dirname, '../src');

describe('BUG-PHASE128-01 — mobile pricing cluster removed', () => {
  it('pricing.store.ts is gone', () => {
    expect(existsSync(`${REPO_MOBILE_SRC}/stores/pricing.store.ts`)).toBe(false);
  });

  it('pricing.service.ts is gone', () => {
    expect(existsSync(`${REPO_MOBILE_SRC}/services/pricing.service.ts`)).toBe(false);
  });

  it('rebooking.service.ts is gone', () => {
    expect(existsSync(`${REPO_MOBILE_SRC}/services/rebooking.service.ts`)).toBe(false);
  });

  it('slot-waitlist.service.ts is gone', () => {
    expect(existsSync(`${REPO_MOBILE_SRC}/services/slot-waitlist.service.ts`)).toBe(false);
  });

  it('regression guard: live stores still in place', () => {
    expect(existsSync(`${REPO_MOBILE_SRC}/stores/auth.store.ts`)).toBe(true);
    expect(existsSync(`${REPO_MOBILE_SRC}/stores/booking.store.ts`)).toBe(true);
    expect(existsSync(`${REPO_MOBILE_SRC}/stores/recurring.store.ts`)).toBe(true);
  });

  it('regression guard: live services still in place', () => {
    expect(existsSync(`${REPO_MOBILE_SRC}/services/booking.service.ts`)).toBe(true);
    expect(existsSync(`${REPO_MOBILE_SRC}/services/payment.service.ts`)).toBe(true);
    expect(existsSync(`${REPO_MOBILE_SRC}/services/notification.service.ts`)).toBe(true);
  });
});
