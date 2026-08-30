import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks }));

import BookingsPage from '../BookingsPage';

it('Bug UX-500 — booking operations renders responsive exception signals and linked support-case ownership beside canonical participants', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: {
    success: true,
    summary: { totalBookings: 40, activeBookings: 12, unassignedActive: 3, openSupportBookings: 5, disputedBookings: 2, pastScheduledBookings: 4 },
    data: [{
      id: 'booking-12345678', customerId: 'customer-123', providerId: 'provider-123', categoryId: 'category-1',
      status: 'in_progress', escrowStatus: 'held', totalAmount: 125000, city: 'Cebu City',
      scheduledAt: '2026-08-30T01:00:00.000Z', customerName: 'Ana Reyes', providerName: 'Cebu Home Pro',
      categoryName: 'Cleaning', createdAt: '2026-08-29T01:00:00.000Z', openSupportTickets: 2,
      unassignedSupportTickets: 1, urgentSupportTickets: 1, supportOwnerNames: 'Jo Santos', openDisputes: 1, pastScheduled: true,
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><BookingsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('region', { name: 'Booking operations rows' })).toBeVisible();
  expect(screen.getByRole('button', { name: /Paid needs assignment/ })).toHaveTextContent('3');
  expect(screen.getByText('Ana Reyes')).toHaveAttribute('to', '/customers/customer-123');
  expect(screen.getByText('Cebu Home Pro')).toHaveAttribute('to', '/providers/provider-123');
  expect(screen.getByText('2 open support cases')).toHaveAttribute('to', '/support-tickets?bookingId=booking-12345678');
  expect(screen.getByText('Assigned: Jo Santos')).toBeVisible();
  expect(screen.getByText('1 urgent')).toBeVisible();
  expect(screen.getByText('1 open dispute')).toBeVisible();
  expect(screen.getByText('Past scheduled time')).toBeVisible();
  expect(screen.getByText(/Payment and refund truth lives in Booking 360/)).toBeVisible();
});
