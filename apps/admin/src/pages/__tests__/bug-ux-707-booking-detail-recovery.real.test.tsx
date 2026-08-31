import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Booking service unavailable' }));

import BookingDetailPage from '../BookingDetailPage';

it('Bug UX-707 — Booking 360 recovers its primary record in place instead of stranding support staff', async () => {
  apiMocks.get
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          status: 'confirmed',
          escrowStatus: 'held',
          scheduledAt: null,
          completedAt: null,
          confirmedAt: null,
          cancelledAt: null,
          cancellationReason: null,
          pricingMode: 'fixed_price',
          servicePrice: 100000,
          serviceFee: 25000,
          totalAmount: 125000,
          conversationId: null,
          category: { id: 'category-1', name: 'Cleaning' },
          subcategory: null,
          address: null,
          customer: null,
          provider: null,
          createdAt: '2026-08-31T00:00:00.000Z',
        },
      },
    });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/bookings/11111111-1111-4111-8111-111111111111']}>
        <Routes>
          <Route path="/bookings/:id" element={<BookingDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Failed to load booking')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry booking' }));

  expect(await screen.findByRole('heading', { name: 'Booking #11111111' })).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledTimes(2);
});
