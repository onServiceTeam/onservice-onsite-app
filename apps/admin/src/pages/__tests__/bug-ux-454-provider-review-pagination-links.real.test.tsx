import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ReviewsTab } from '../ProviderDetailPage';

it('Bug UX-454 — Provider 360 reviews expose pagination plus canonical customer and booking links', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
    rows: [{
      id: 'review-1', bookingId: 'booking-review-1', reviewerId: 'customer-review-1',
      reviewerName: 'Ana Reyes', rating: 5, comment: 'Good work', isVisible: true,
      isFlagged: false, privateNote: null, adminResponse: null, imageUrls: [],
      createdAt: '2026-08-30T01:00:00.000Z',
    }], total: 21, page: 1, pageSize: 20,
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><ReviewsTab providerId="provider-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByLabelText('Open customer customer-review-1')).toHaveAttribute('to', '/customers/customer-review-1');
  expect(screen.getByLabelText('Open booking booking-review-1')).toHaveAttribute('to', '/bookings/booking-review-1');
  expect(screen.getByText(/Showing/).parentElement).toHaveTextContent('Showing 1 to 20 of 21 results');
  expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/providers/provider-1/reviews', { params: { page: 1, pageSize: 20 } });
});
