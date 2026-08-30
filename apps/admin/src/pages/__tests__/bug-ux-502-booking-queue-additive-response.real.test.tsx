import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks }));

import BookingsPage from '../BookingsPage';

it('Bug UX-502 — booking queue keeps an older additive API response usable while the new summary and ownership fields are absent', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: {
    success: true,
    data: [{
      id: 'booking-legacy1', customerId: 'customer-1', providerId: null, categoryId: 'category-1',
      status: 'paid', escrowStatus: 'held', totalAmount: 100000, city: 'Mandaue', scheduledAt: null,
      customerName: 'Legacy Customer', providerName: null, categoryName: 'Cleaning', createdAt: '2026-08-30T01:00:00.000Z',
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><BookingsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Legacy Customer')).toHaveAttribute('to', '/customers/customer-1');
  expect(screen.getByText('Provider unassigned')).toBeVisible();
  expect(screen.getByText('0 open support cases')).toHaveAttribute('to', '/support-tickets?bookingId=booking-legacy1');
  expect(screen.getByText('No linked active case')).toBeVisible();
  expect(screen.getByRole('button', { name: /All bookings/ })).toHaveTextContent('0');
});
