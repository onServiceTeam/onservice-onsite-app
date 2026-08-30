import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: () => 'Request failed',
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { BookingsTab, DisputesTab, PaymentsTab } from '../CustomerDetailPage';

it('Bug UX-443 — Customer 360 links booking, payment, dispute, and provider records to their canonical workspaces', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/bookings')) {
      return { data: { success: true, data: {
        rows: [{
          id: 'booking-list-123', providerId: 'provider-list-123', providerBusinessName: 'Cebu Plumbing',
          categoryName: 'Plumbing', status: 'paid', totalAmount: 120000,
          scheduledAt: '2026-08-31T01:00:00.000Z', completedAt: null,
          ratingGiven: null, hasDispute: false,
        }], total: 1, page: 1, pageSize: 20,
      } } };
    }
    if (url.endsWith('/payments')) {
      return { data: { success: true, data: {
        walletAvailable: 5000, walletPending: 0, paymentMethodCounts: { gcash: 1 },
        recentTransactions: [{
          id: 'transaction-1', type: 'payment', amount: -120000, balanceAfter: 5000,
          description: 'Booking payment', bookingId: 'payment-booking-123',
          createdAt: '2026-08-30T01:00:00.000Z',
        }],
        recentPaymentIntents: [{
          id: 'intent-1', bookingId: 'intent-booking-123', providerId: 'payment-provider-123',
          paymentMethod: 'gcash', status: 'succeeded', amount: 120000,
          createdAt: '2026-08-30T01:00:00.000Z',
        }],
      } } };
    }
    return { data: { success: true, data: {
      rows: [{
        id: 'dispute-123', bookingId: 'dispute-booking-123', providerId: 'dispute-provider-123',
        providerBusinessName: 'Cebu Electrical', type: 'quality', status: 'under_review',
        resolutionType: null, refundAmount: 0, createdAt: '2026-08-30T01:00:00.000Z',
      }],
      fraudPattern: { disputesInWindow: 1, windowDays: 30, favorProviderRate: null, flagged: false, reason: null },
    } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BookingsTab customerId="customer-1" />
        <PaymentsTab customerId="customer-1" />
        <DisputesTab customerId="customer-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  // The global admin test harness renders Router links as anchors with their
  // `to` target preserved. Assert those rendered targets directly.
  expect(await screen.findByLabelText('Open booking booking-list-123')).toHaveAttribute('to', '/bookings/booking-list-123');
  expect(screen.getByLabelText('Open booking payment-booking-123')).toHaveAttribute('to', '/bookings/payment-booking-123');
  expect(screen.getByLabelText('Open booking intent-booking-123')).toHaveAttribute('to', '/bookings/intent-booking-123');
  expect(screen.getByLabelText('Open provider payment-provider-123')).toHaveAttribute('to', '/providers/payment-provider-123');
  expect(screen.getByLabelText('Open dispute dispute-123')).toHaveAttribute('to', '/disputes/dispute-123');
  expect(screen.getByLabelText('Open booking dispute-booking-123')).toHaveAttribute('to', '/bookings/dispute-booking-123');
  expect(screen.getByLabelText('Open provider dispute-provider-123')).toHaveAttribute('to', '/providers/dispute-provider-123');
});
