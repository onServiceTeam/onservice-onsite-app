import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const REVIEW_ID = '11920000-0000-4abc-8def-000000001192';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ReviewsTab } from '../ProviderDetailPage';

it('Bug UX-1192 - a valid uppercase review UUID resolves to the canonical exact review', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
    rows: [{
      id: REVIEW_ID,
      bookingId: 'booking-1',
      reviewerId: 'customer-1',
      reviewerName: 'Ana Reyes',
      rating: 5,
      comment: 'Canonical review evidence',
      isVisible: true,
      isFlagged: false,
      privateNote: null,
      adminResponse: null,
      imageUrls: [],
      createdAt: '2026-09-03T13:11:00.000Z',
    }],
    total: 1,
    page: 1,
    pageSize: 1,
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReviewsTab providerId="provider-1" exactReviewId={REVIEW_ID.toUpperCase()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Canonical review evidence')).toBeVisible();
  expect(screen.queryByText(/No substitute review is shown/i)).not.toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledWith(
    '/api/v1/admin/providers/provider-1/reviews',
    { params: { reviewId: REVIEW_ID } },
  );
});
