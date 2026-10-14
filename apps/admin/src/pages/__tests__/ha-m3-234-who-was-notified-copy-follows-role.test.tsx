// HA-M3-234 (D38 Milestone 3, integrated review 2026-10-14): Booking 360's
// "Who was notified" note tells the truth for the viewer's role. An admin is
// told phone numbers stay masked until a logged Call provider. A super_admin
// already receives full numbers (D25) and calls without a reveal, so they are
// not told the numbers are masked or that their calls are logged.
import React from 'react';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
const auth = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('@/stores/auth.store', () => {
  const state = () => ({ isAuthenticated: true, user: { id: 'admin-1', email: 'admin@onservice.us', role: auth.role } });
  const useAuthStore = (selector?: (s: unknown) => unknown) => (selector ? selector(state()) : state());
  (useAuthStore as unknown as { getState: () => unknown }).getState = state;
  return { useAuthStore };
});

import { QuotesTab } from '../BookingDetailPage';
import { MARKETPLACE, invite, invitesResponse, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

const MASKED = 'Phone numbers stay masked until you choose Call provider, which is logged.';
const FULL = 'As a super admin you see full phone numbers. Other admins see them masked, and each Call provider is logged.';

it('HA-M3-234: an admin is told numbers stay masked; a super_admin is told they see full numbers', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/bookings/booking-234/quotes') {
      return { data: { success: true, data: { quotes: [], changeOrders: [] } } };
    }
    if (url === `${MARKETPLACE}/bookings/booking-234/invites`) {
      return invitesResponse([invite({ inviteId: 'invite-1', providerId: 'provider-1', providerName: 'Ramon Cruz Aircon', round: 1 })], { applicable: true, currentRound: 1 });
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  auth.role = 'admin';
  const asAdmin = renderWithProviders(<QuotesTab bookingId="booking-234" pricingMode="quote_based" />);
  expect(await screen.findByText(MASKED, { exact: false })).toBeInTheDocument();
  expect(screen.queryByText(FULL, { exact: false })).toBeNull();
  asAdmin.unmount();

  auth.role = 'super_admin';
  renderWithProviders(<QuotesTab bookingId="booking-234" pricingMode="quote_based" />);
  expect(await screen.findByText(FULL, { exact: false })).toBeInTheDocument();
  expect(screen.queryByText(MASKED, { exact: false })).toBeNull();
});
