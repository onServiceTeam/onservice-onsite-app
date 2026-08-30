import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { JobsTab } from '../ProviderDetailPage';

it('Bug UX-452 — Provider 360 jobs link the booking, customer, and dispute and expose every canonical booking status', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
    rows: [{
      id: 'booking-12345678', customerId: 'customer-123', customerName: 'Ana Reyes',
      categoryName: 'Cleaning', status: 'disputed', totalAmount: 120000, serviceFee: 12000,
      scheduledAt: '2026-08-30T01:00:00.000Z', completedAt: null, rating: null,
      hasDispute: true, disputeId: 'dispute-123',
    }], total: 1, page: 1, pageSize: 20,
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><JobsTab providerId="provider-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByLabelText('Open booking booking-12345678')).toHaveAttribute('to', '/bookings/booking-12345678');
  expect(screen.getByLabelText('Open customer customer-123')).toHaveAttribute('to', '/customers/customer-123');
  expect(screen.getByLabelText('Open dispute for booking booking-12345678')).toHaveAttribute('to', '/disputes/dispute-123');
  expect(screen.getByRole('option', { name: 'Cancelled (admin)' })).toHaveValue('cancelled_by_admin');
  expect(screen.getByRole('option', { name: 'Paid out' })).toHaveValue('paid_out');
});
