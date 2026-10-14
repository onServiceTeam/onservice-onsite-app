// HA-M3-208 (D38 Milestone 3, review gap): "Who was notified" belongs to quote
// requests only. On a fixed-price booking (pricingMode fixed_price) the Quotes
// tab has no "Who was notified" section and never asks for the invites.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import BookingDetailPage from '../BookingDetailPage';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

const detail = {
  id: 'sample-id', status: 'confirmed', escrowStatus: null, scheduledAt: null,
  completedAt: null, confirmedAt: null, cancelledAt: null, cancellationReason: null,
  pricingMode: 'fixed_price', servicePrice: 150_000, serviceFee: 0, totalAmount: 150_000,
  conversationId: null, category: { id: 'category-1', name: 'Aircon' }, subcategory: null,
  address: { full: '1 Gorordo Avenue', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu' },
  customer: { id: 'customer-1', fullName: 'Ana Reyes', phone: '+63 9XX XXX 1111', email: null, avatarUrl: null, lifetimeBookings: 1, averageRatingGiven: null },
  provider: null,
  businessContext: null,
  createdAt: '2026-10-14T01:55:00.000Z',
};

it('HA-M3-208: a fixed-price booking has no Who was notified section and no invites request', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/bookings/sample-id') return { data: { success: true, data: detail } };
    if (url === '/api/v1/admin/bookings/sample-id/quotes') {
      return { data: { success: true, data: { quotes: [], changeOrders: [] } } };
    }
    return { data: { success: true, data: [] } };
  });

  renderWithProviders(<BookingDetailPage />);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Quotes' }), { button: 0, ctrlKey: false });

  expect(await screen.findByText('Quotes (0)')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Who was notified' })).not.toBeInTheDocument();
  expect(apiMocks.get).not.toHaveBeenCalledWith(`${MARKETPLACE}/bookings/sample-id/invites`, expect.anything());
});
