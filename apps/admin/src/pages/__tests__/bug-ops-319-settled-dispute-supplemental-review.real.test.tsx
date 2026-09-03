import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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

it('Bug OPS-319 — a settled dispute routes new evidence to a linked support case instead of offering mutable reopen', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const detail = {
    id: 'dispute-1', bookingId: 'booking-1', status: 'resolved', tier: 2,
    type: 'incomplete', description: 'The original customer claim.',
    filedBy: 'customer-1', filedAt: '2026-08-30T00:00:00.000Z', ageHours: 48,
    priorityScore: 100, resolvedAt: '2026-08-31T00:00:00.000Z', resolvedBy: 'admin-1',
    resolutionType: 'no_refund', refundAmount: 0,
    decisionNotes: 'The original evidence supported the provider.', internalNotes: null,
    providerResponse: null, providerRespondedAt: null, assignedTo: 'admin-1', booking: null,
    customer: {
      id: 'customer-1', fullName: 'Ana Cruz', phone: '09170000000', avatarUrl: null,
      disputesLast90Days: 1, disputesFavoredCustomerLast90Days: 0, pattern: 'OK',
    },
    provider: null, evidence: [],
  } satisfies DisputeFullDetail;

  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DisputeActions detail={detail} />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByText('Supplemental review required')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Open linked support case' }).closest('a')).toHaveAttribute(
    'to',
    '/support-tickets?bookingId=booking-1&userId=customer-1&userName=Ana+Cruz&userRole=customer&new=1',
  );
});
