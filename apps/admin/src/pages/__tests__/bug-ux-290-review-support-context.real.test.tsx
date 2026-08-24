import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: () => 'Request failed',
}));

import { ReviewsTab } from '../ProviderDetailPage';

it('Bug UX-290 — Provider 360 exposes flagged private review context and photos only inside the admin support view', async () => {
  apiMocks.get.mockResolvedValue({
    data: {
      success: true,
      data: {
        rows: [{
          id: 'review-1', bookingId: 'booking-1', reviewerName: 'Customer One', rating: 2,
          comment: 'The public review explains the visible issue.', isVisible: true, isFlagged: true,
          privateNote: 'Please call me about damage evidence.', adminResponse: null,
          imageUrls: ['https://cdn.example/review-1.jpg'], createdAt: '2026-08-25T00:00:00.000Z',
        }],
        total: 1, page: 1, pageSize: 50,
      },
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ReviewsTab providerId="provider-1" /></QueryClientProvider>);

  expect(await screen.findByText('Private customer note to onService')).toBeVisible();
  expect(screen.getByText('Please call me about damage evidence.')).toBeVisible();
  expect(screen.getByText(/Never shown to the provider or public/i)).toBeVisible();
  expect(screen.getByText('flagged')).toBeVisible();
  expect(screen.getByAltText('Customer review evidence 1')).toHaveAttribute('src', 'https://cdn.example/review-1.jpg');
});
