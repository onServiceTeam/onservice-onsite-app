import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import { LegacyFinancialReviewPanel } from '../LegacyFinancialReviewPanel';

it('Bug UX-1038 — legacy financial review opens the exact participant, booking, and support records', async () => {
  const booking = {
    bookingId: '13800000-0000-4000-8000-000000001038', status: 'paid', escrowStatus: 'held',
    customerId: '23800000-0000-4000-8000-000000001038', customerName: 'Customer 1038',
    providerId: '33800000-0000-4000-8000-000000001038', providerName: 'Provider 1038',
    currentProviderTier: 'verified', categoryName: 'Cleaning', serviceName: 'Move-out cleaning',
    servicePriceCentavos: 100000, serviceFeeCentavos: 0, totalAmountCentavos: 100000,
    paymentMethod: 'wallet', bookingPaymentIntentId: 'intent-1038',
    scheduledAt: '2026-09-05T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T01:00:00.000Z',
  };
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/financials/legacy-reviews') {
      return { data: { success: true, data: { items: [booking], total: 1 } } } as never;
    }
    if (url.endsWith(booking.bookingId)) {
      return { data: { success: true, data: {
        booking, paymentIntents: [], walletTransactions: [], quotes: [],
      } } } as never;
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><LegacyFinancialReviewPanel /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: 'Customer 1038' })).toHaveAttribute(
    'href', '/customers/23800000-0000-4000-8000-000000001038',
  );
  expect(screen.getByRole('link', { name: 'Provider 1038' })).toHaveAttribute(
    'href', '/providers/33800000-0000-4000-8000-000000001038',
  );

  fireEvent.click(screen.getByRole('button', { name: 'Review evidence' }));
  expect(await screen.findByRole('link', { name: 'Open Booking 360' })).toHaveAttribute(
    'href', '/bookings/13800000-0000-4000-8000-000000001038',
  );
  expect(screen.getByRole('link', { name: 'Open Customer 360' })).toHaveAttribute(
    'href', '/customers/23800000-0000-4000-8000-000000001038',
  );
  expect(screen.getByRole('link', { name: 'Open Provider 360' })).toHaveAttribute(
    'href', '/providers/33800000-0000-4000-8000-000000001038',
  );
  expect(screen.getByRole('link', { name: 'Open booking support history' })).toHaveAttribute(
    'href', '/support-tickets?bookingId=13800000-0000-4000-8000-000000001038',
  );
});
