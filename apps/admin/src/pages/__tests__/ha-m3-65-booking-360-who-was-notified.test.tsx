// HA-M3-65 (D38 Milestone 3): on a quote request (pricingMode quote_based),
// Booking 360's Quotes tab opens with "Who was notified": every provider told
// about the request in each round (newest round first), what they did, when,
// and their phone masked (D25) behind the audit-logged "Call provider".
// Source: GET /api/v1/admin/marketplace-health/bookings/:id/invites. The
// whole page renders (useParams gives 'sample-id' from vitest.setup.ts).
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import BookingDetailPage from '../BookingDetailPage';
import {
  MARKETPLACE, invite, invitesResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

const detail = {
  id: 'sample-id', status: 'quoted', escrowStatus: null, scheduledAt: null,
  completedAt: null, confirmedAt: null, cancelledAt: null, cancellationReason: null,
  pricingMode: 'quote_based', servicePrice: 0, serviceFee: 0, totalAmount: 0,
  conversationId: null, category: { id: 'category-1', name: 'Aircon' }, subcategory: null,
  address: { full: '1 Gorordo Avenue', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu' },
  customer: { id: 'customer-1', fullName: 'Ana Reyes', phone: '+63 9XX XXX 1111', email: null, avatarUrl: null, lifetimeBookings: 1, averageRatingGiven: null },
  provider: null,
  businessContext: null,
  createdAt: '2026-10-14T01:55:00.000Z',
};

it('HA-M3-65: Booking 360 Quotes tab shows Who was notified per round with masked phones and Call provider', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/bookings/sample-id') {
      return { data: { success: true, data: detail } };
    }
    if (url === '/api/v1/admin/bookings/sample-id/quotes') {
      return { data: { success: true, data: { quotes: [], changeOrders: [] } } };
    }
    if (url === `${MARKETPLACE}/bookings/sample-id/invites`) {
      return invitesResponse([
        invite({
          inviteId: 'invite-r2',
          providerId: 'provider-b',
          providerName: 'Lito Ramos Plumbing',
          phone: '+63 9XX XXX 2233',
          round: 2,
          status: 'quoted',
          viewedAt: '2026-10-14T03:02:00.000Z',
          respondedAt: '2026-10-14T03:12:00.000Z',
          responseMinutes: 12,
          quoteId: 'quote-2',
          quoteStatus: 'submitted',
        }),
        invite({
          inviteId: 'invite-r1',
          providerId: 'provider-a',
          providerName: 'Ramon Cruz Aircon',
          phone: '+63 9XX XXX 4567',
          round: 1,
          status: 'viewed',
          viewedAt: '2026-10-14T02:05:00.000Z',
        }),
      ], { applicable: true, currentRound: 2 });
    }
    return { data: { success: true, data: [] } };
  });

  renderWithProviders(<BookingDetailPage />);

  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Quotes' }), { button: 0, ctrlKey: false });

  expect(await screen.findByRole('heading', { name: 'Who was notified' })).toBeInTheDocument();
  const roundTwo = await screen.findByRole('region', { name: 'Round 2 providers' });
  const roundOne = screen.getByRole('region', { name: 'Round 1 providers' });
  expect(roundTwo.compareDocumentPosition(roundOne) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(roundTwo).getByText('Round 2 (current): 1 provider, 1 sent a quote')).toBeInTheDocument();
  expect(within(roundTwo).getByText('Lito Ramos Plumbing')).toBeInTheDocument();
  expect(within(roundTwo).getByText('Sent a quote')).toBeInTheDocument();
  expect(within(roundTwo).getByText(/\(after 12 min\)$/)).toBeInTheDocument();
  expect(within(roundTwo).getByText('+63 9XX XXX 2233')).toBeInTheDocument();
  expect(within(roundOne).getByText('Ramon Cruz Aircon')).toBeInTheDocument();
  expect(within(roundOne).getByText('Opened, no quote yet')).toBeInTheDocument();
  expect(within(roundOne).getByText('No quote')).toBeInTheDocument();
  expect(within(roundOne).getByText('+63 9XX XXX 4567')).toBeInTheDocument();
  expect(within(roundOne).getByRole('button', { name: 'Call provider Ramon Cruz Aircon' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^Call / })).not.toBeInTheDocument();
  expect(apiMocks.post).not.toHaveBeenCalled();
  expect(await screen.findByText('Quotes (0)')).toBeInTheDocument();
});
