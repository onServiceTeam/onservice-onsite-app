import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'super_admin' } }),
}));

import { DisputeActions, type DisputeFullDetail } from '../DisputeDetailPage';

it('Bug OPS-313 — split-decision confirmation previews the operator-entered allocation instead of a hardcoded half', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const detail = {
    id: 'dispute-1',
    bookingId: 'booking-1',
    status: 'under_review',
    tier: 2,
    type: 'incomplete',
    description: 'Only part of the agreed work was completed.',
    filedBy: 'customer-1',
    filedAt: '2026-09-01T08:00:00.000Z',
    ageHours: 3,
    priorityScore: 300000,
    resolvedAt: null,
    resolvedBy: null,
    resolutionType: null,
    refundAmount: null,
    decisionNotes: null,
    internalNotes: null,
    providerResponse: 'The provider confirms one task was not completed.',
    providerRespondedAt: '2026-09-01T09:00:00.000Z',
    assignedTo: 'admin-1',
    booking: {
      id: 'booking-1',
      status: 'disputed',
      totalAmount: 100000,
      scheduledAt: '2026-09-01T04:00:00.000Z',
      completedAt: '2026-09-01T06:00:00.000Z',
      servicePrice: 100000,
      serviceFee: 0,
    },
    customer: null,
    provider: null,
    evidence: [],
  } satisfies DisputeFullDetail;

  render(
    <QueryClientProvider client={client}>
      <DisputeActions detail={detail} />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByLabelText('Split decision'));
  fireEvent.change(screen.getByLabelText(/Refund percent/), { target: { value: '25' } });
  fireEvent.change(screen.getByLabelText(/Decision notes/), {
    target: { value: 'The evidence supports refunding one quarter of the booking.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Resolve & notify' }));

  expect(screen.getByText(/Estimated approved refund:/)).toHaveTextContent('₱250.00');
  expect(screen.getByText(/Estimated approved refund:/)).not.toHaveTextContent('₱500.00');
});
