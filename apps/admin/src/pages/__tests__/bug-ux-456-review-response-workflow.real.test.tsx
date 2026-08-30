import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ReviewsTab } from '../ProviderDetailPage';

it('Bug UX-456 — a public review response separates customer-visible text from the internal audit rationale', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: { rows: [{
    id: 'review-1', bookingId: 'booking-1', reviewerId: 'customer-1', reviewerName: 'Ana',
    rating: 3, comment: 'Issue reported', isVisible: true, isFlagged: false, privateNote: null,
    adminResponse: null, imageUrls: [], createdAt: '2026-08-30T01:00:00.000Z',
  }], total: 1, page: 1, pageSize: 20 } } });
  apiMocks.patch.mockResolvedValueOnce({ data: { success: true } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><ReviewsTab providerId="provider-1" /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /add response/i }));
  fireEvent.change(screen.getByLabelText('Public response'), { target: { value: 'Support reviewed this case and contacted both parties.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  expect(await screen.findByText(/rationale stays in the admin audit trail/i)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Case OS-991 was resolved after evidence review.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish response' }));

  await waitFor(() => expect(apiMocks.patch).toHaveBeenCalledWith(
    '/api/v1/admin/providers/provider-1/reviews/review-1/response',
    {
      response: 'Support reviewed this case and contacted both parties.',
      reason: 'Case OS-991 was resolved after evidence review.',
    },
  ));
});
