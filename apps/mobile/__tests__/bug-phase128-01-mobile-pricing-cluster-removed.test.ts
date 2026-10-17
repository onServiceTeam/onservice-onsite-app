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

// The two regression guards at the end of this file used to assert only
// that the live files exist (expect(existsSync(...)).toBe(true)). CLAUDE.md
// bans that shape and Gate C article no-fake-tests now rejects it
// (2026-10-14, D40). The guards now load the REAL live stores and services
// and run them against a fake API client and fake storage, so a deleted,
// renamed or broken live module fails here, not just a missing file.
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockStoreUser = jest.fn();
jest.unmock('@/stores/auth.store');
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  setAuthSessionExpiredHandler: () => undefined,
  storage: { getString: () => undefined, set: () => undefined, delete: () => undefined },
}));
jest.mock('@/services/secure-storage', () => ({
  initSecureStorage: jest.fn().mockResolvedValue(undefined),
  getAccessToken: jest.fn().mockReturnValue(undefined),
  getRefreshToken: jest.fn().mockReturnValue(undefined),
  storeTokens: jest.fn(),
  clearTokens: jest.fn(),
  getStoredUser: jest.fn().mockReturnValue(undefined),
  storeUser: (...args: unknown[]) => mockStoreUser(...args),
  clearStoredUser: jest.fn(),
  getSecureItem: jest.fn(),
  setSecureItem: jest.fn(),
  removeSecureItem: jest.fn(),
}));
jest.mock('@/services/device-fingerprint.service', () => ({ getDeviceFingerprint: async () => 'synthetic-device-phase128' }));
jest.mock('@/services/push-token.service', () => ({ unregisterStoredPushToken: jest.fn() }));
jest.mock('@/stores/provider-application-session.store', () => ({ resetApplicationSession: jest.fn() }));

import { useAuthStore, type User } from '@/stores/auth.store';
import { useBookingStore } from '@/stores/booking.store';
import { useRecurringStore } from '@/stores/recurring.store';
import { createBooking, type CreateBookingPayload } from '@/services/booking.service';
import { createPaymentIntent } from '@/services/payment.service';
import { getNotifications } from '@/services/notification.service';

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

  it('regression guard: live stores still load and update their state', () => {
    const user: User = {
      id: 'user-phase128',
      phone: '+639171234567',
      email: null,
      firstName: 'Ana',
      lastName: 'Cruz',
      role: 'customer',
      avatarUrl: null,
    };
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);
    expect(mockStoreUser).toHaveBeenCalledWith(JSON.stringify(user));

    useBookingStore.getState().setCategory('category-1', 'Cleaning', 'cleaning');
    expect(useBookingStore.getState().draft.categoryId).toBe('category-1');
    expect(useBookingStore.getState().draft.categorySlug).toBe('cleaning');

    useRecurringStore.setState({ error: 'stale error' });
    useRecurringStore.getState().clearError();
    expect(useRecurringStore.getState().error).toBeNull();
  });

  it('regression guard: live services still send their API requests', async () => {
    const payload: CreateBookingPayload = {
      categoryId: 'category-1',
      subcategoryId: 'subcategory-1',
      bookingType: 'fixed_price',
      description: 'Deep clean',
      address: '1 Osmena Blvd',
      barangay: 'Capitol Site',
      city: 'Cebu City',
      province: 'Cebu',
      latitude: 10.3157,
      longitude: 123.8854,
      scheduledAt: '2026-10-20T09:00:00.000Z',
    };
    mockPost.mockResolvedValueOnce({ data: { data: { id: 'booking-1' } } });
    await expect(createBooking(payload)).resolves.toEqual({ id: 'booking-1' });
    expect(mockPost).toHaveBeenLastCalledWith('/api/v1/bookings', payload);

    mockPost.mockResolvedValueOnce({ data: { data: { id: 'intent-1' } } });
    await expect(createPaymentIntent('booking-1', 'wallet')).resolves.toEqual({ id: 'intent-1' });
    expect(mockPost).toHaveBeenLastCalledWith('/api/v1/payments/intent', {
      bookingId: 'booking-1',
      paymentMethod: 'wallet',
    });

    mockGet.mockResolvedValueOnce({ data: { data: [], meta: { total: 0, unread: 0 } } });
    await expect(getNotifications()).resolves.toEqual({ notifications: [], total: 0, unread: 0 });
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/notifications', {
      params: { page: 1, pageSize: 20 },
    });
  });
});
