import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

import { ReviewsTab } from '../ProviderDetailPage';

it('Bug UX-455 — hiding a public review requires an explicit moderation reason and sends it to the audit endpoint', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: { rows: [{
    id: 'review-1', bookingId: 'booking-1', reviewerId: 'customer-1', reviewerName: 'Ana',
    rating: 1, comment: 'Review text', isVisible: true, isFlagged: true, privateNote: null,
    adminResponse: null, imageUrls: [], createdAt: '2026-08-30T01:00:00.000Z',
  }], total: 1, page: 1, pageSize: 20 } } });
  apiMocks.patch.mockResolvedValueOnce({ data: { success: true } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><ReviewsTab providerId="provider-1" /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /hide/i }));

  expect(screen.getByText(/stop appearing in customer-facing provider profiles/i)).toBeVisible();
  const submit = screen.getByRole('button', { name: 'Hide review' });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Contains private contact details and violates policy.' } });
  fireEvent.click(submit);

  await waitFor(() => expect(apiMocks.patch).toHaveBeenCalledWith(
    '/api/v1/admin/providers/provider-1/reviews/review-1/visibility',
    { isVisible: false, reason: 'Contains private contact details and violates policy.' },
  ));
});
