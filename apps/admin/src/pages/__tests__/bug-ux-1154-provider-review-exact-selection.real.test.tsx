import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const REVIEW_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ReviewsTab } from '../ProviderDetailPage';

it('Bug UX-1154 — an exact Provider 360 review link requests and selects only the provider-owned canonical review', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: {
    rows: [{
      id: REVIEW_ID, bookingId: 'booking-1', reviewerId: 'customer-1', reviewerName: 'Ana Reyes',
      rating: 5, comment: 'Exact review evidence', isVisible: true, isFlagged: false,
      privateNote: null, adminResponse: null, imageUrls: [], createdAt: '2026-09-01T00:00:00.000Z',
    }], total: 1, page: 1, pageSize: 1,
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ReviewsTab providerId="provider-1" exactReviewId={REVIEW_ID} /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Exact provider review evidence')).toBeVisible();
  const selectedComment = screen.getByText('Exact review evidence');
  expect(selectedComment.closest('[aria-current="true"]')).not.toBeNull();
  expect(screen.queryByText('1 review on record')).not.toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledWith(
    '/api/v1/admin/providers/provider-1/reviews',
    { params: { reviewId: REVIEW_ID } },
  );
});
