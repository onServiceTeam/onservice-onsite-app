import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import BookingDetailPage from '../BookingDetailPage';

const detail = {
  id: 'sample-id', status: 'paid', escrowStatus: 'held', scheduledAt: '2026-08-31T01:00:00.000Z',
  completedAt: null, confirmedAt: null, cancelledAt: null, cancellationReason: null,
  pricingMode: 'fixed_price', servicePrice: 100000, serviceFee: 25000, totalAmount: 125000,
  conversationId: 'conversation-1', category: { id: 'category-1', name: 'Cleaning' }, subcategory: null,
  address: { full: '1 Osmeña Boulevard', barangay: 'Capitol Site', city: 'Cebu City', province: 'Cebu' },
  customer: { id: 'customer-1', fullName: 'Ana Reyes', phone: '+639171234567', email: 'ana@example.com', avatarUrl: null, lifetimeBookings: 3, averageRatingGiven: 4.8 },
  provider: { id: 'provider-1', userId: 'provider-user-1', businessName: 'Cebu Home Pro', tier: 'verified', fullName: 'Paolo Santos', phone: '+639189876543', avatarUrl: null, rating: 4.9, lifetimeJobs: 40 },
  createdAt: '2026-08-30T01:00:00.000Z',
};

it('Bug UX-475 — Booking 360 provides direct exits to its conversation, support cases, customer, and provider records', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: detail } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><BookingDetailPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Open conversation')).toHaveAttribute('to', '/communications?bookingId=sample-id');
  expect(screen.getByText('Support cases')).toHaveAttribute('to', '/support-tickets?bookingId=sample-id');
  expect(screen.getByText('Ana Reyes')).toHaveAttribute('to', '/customers/customer-1');
  expect(screen.getByText('Cebu Home Pro')).toHaveAttribute('to', '/providers/provider-1');
});
