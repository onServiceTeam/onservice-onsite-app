import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ReviewsTab } from '../ProviderDetailPage';

it('Bug UX-1156 — Provider 360 refuses to substitute a mismatched review returned for an exact evidence request', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: {
    rows: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', bookingId: 'booking-1',
      reviewerId: 'customer-1', reviewerName: 'Ana Reyes', rating: 5,
      comment: 'Different review', isVisible: true, isFlagged: false, privateNote: null,
      adminResponse: null, imageUrls: [], createdAt: '2026-09-01T00:00:00.000Z',
    }], total: 1, page: 1, pageSize: 1,
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReviewsTab providerId="provider-1" exactReviewId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('No substitute review is shown');
  expect(screen.queryByText('Different review')).not.toBeInTheDocument();
  expect(screen.queryByText('Exact provider review evidence')).not.toBeInTheDocument();
});
