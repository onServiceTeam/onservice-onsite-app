import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import BookingsPage from '../BookingsPage';

it('Bug UX-463 — the booking queue links its customer and assigned provider to their canonical case workspaces', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: {
    success: true,
    data: [{
      id: 'booking-12345678', customerId: 'customer-123', providerId: 'provider-123', categoryId: 'category-1',
      status: 'paid', escrowStatus: 'held', totalAmount: 125000, city: 'Cebu City',
      scheduledAt: '2026-08-31T01:00:00.000Z', customerName: 'Ana Reyes',
      providerName: 'Cebu Home Pro', categoryName: 'Cleaning', createdAt: '2026-08-30T01:00:00.000Z',
    }],
    pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><BookingsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Ana Reyes')).toHaveAttribute('to', '/customers/customer-123');
  expect(screen.getByText('Cebu Home Pro')).toHaveAttribute('to', '/providers/provider-123');
  expect(screen.getByText('booking-')).toHaveAttribute('to', '/bookings/booking-12345678');
  expect(screen.getByRole('textbox', { name: /search bookings by booking, customer, provider, service, city, or party id/i })).toBeVisible();
});
