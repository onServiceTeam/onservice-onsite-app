import React from 'react';
import { render, screen } from '@testing-library/react';
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

it('Bug OPS-318 — Dispute 360 removes remedy choices that cannot perform their promised work', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const detail = {
    id: 'dispute-1', bookingId: 'booking-1', status: 'under_review', tier: 2,
    type: 'substandard', description: 'The work did not meet the booked scope.',
    filedBy: 'customer-1', filedAt: '2026-09-01T00:00:00.000Z', ageHours: 4,
    priorityScore: 100, resolvedAt: null, resolvedBy: null, resolutionType: null,
    refundAmount: null, decisionNotes: null, internalNotes: null,
    providerResponse: null, providerRespondedAt: null, assignedTo: null,
    booking: null, customer: null, provider: null, evidence: [],
  } satisfies DisputeFullDetail;

  render(
    <QueryClientProvider client={client}>
      <DisputeActions detail={detail} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/Free redo and refund \+ warning are temporarily unavailable/)).toBeTruthy();
  expect(screen.queryByLabelText('Free redo')).toBeNull();
  expect(screen.queryByLabelText('Refund + warning')).toBeNull();
  expect(screen.getByLabelText('Full refund')).toBeTruthy();
  expect(screen.getByLabelText('Refund + suspension')).toBeTruthy();
});
