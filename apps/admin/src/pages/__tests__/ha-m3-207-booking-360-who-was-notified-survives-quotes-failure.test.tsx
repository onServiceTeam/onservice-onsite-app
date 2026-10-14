// HA-M3-207 (D38 Milestone 3, review gap): on a quote request, Booking 360's
// "Who was notified" does not depend on the quotes list. When
// GET /api/v1/admin/bookings/:id/quotes fails, the Quotes tab shows "Failed to
// load quotes" and still lists the notified providers from
// GET /api/v1/admin/marketplace-health/bookings/:id/invites. The whole page
// renders (useParams gives 'sample-id' from vitest.setup.ts).
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
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
  id: 'sample-id', status: 'requested', escrowStatus: null, scheduledAt: null,
  completedAt: null, confirmedAt: null, cancelledAt: null, cancellationReason: null,
  pricingMode: 'quote_based', servicePrice: 0, serviceFee: 0, totalAmount: 0,
  conversationId: null, category: { id: 'category-1', name: 'Aircon' }, subcategory: null,
  address: { full: '1 Gorordo Avenue', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu' },
  customer: { id: 'customer-1', fullName: 'Ana Reyes', phone: '+63 9XX XXX 1111', email: null, avatarUrl: null, lifetimeBookings: 1, averageRatingGiven: null },
  provider: null,
  businessContext: null,
  createdAt: '2026-10-14T01:55:00.000Z',
};

it('HA-M3-207: when the quotes request fails, Booking 360 still shows Who was notified', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/bookings/sample-id') return { data: { success: true, data: detail } };
    if (url === '/api/v1/admin/bookings/sample-id/quotes') throw new Error('Quotes service offline');
    if (url === `${MARKETPLACE}/bookings/sample-id/invites`) {
      return invitesResponse([
        invite({ inviteId: 'invite-207', providerId: 'provider-a', providerName: 'Ramon Cruz Aircon', status: 'sent' }),
      ]);
    }
    return { data: { success: true, data: [] } };
  });

  renderWithProviders(<BookingDetailPage />);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Quotes' }), { button: 0, ctrlKey: false });

  expect(await screen.findByText('Failed to load quotes')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Who was notified' })).toBeInTheDocument();
  expect(await screen.findByText('Ramon Cruz Aircon')).toBeInTheDocument();
});
