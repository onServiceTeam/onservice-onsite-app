import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'super_admin' } }),
}));

import DisputesPage from '../DisputesPage';

beforeEach(() => {
  apiMocks.get.mockReset();
  apiMocks.get.mockResolvedValue({
    data: {
      success: true,
      data: [{
        id: 'dispute-12345678', bookingId: 'booking-12345678', filedBy: 'customer-1',
        customerName: 'Maria Santos', providerName: 'Cebu Home Care', type: 'incomplete',
        status: 'under_review', tier: 2, assignedTo: 'admin-1', resolutionType: null,
        refundAmount: 0, refundPercent: null, decisionNotes: null,
        description: 'The completed work did not match the agreed scope.',
        providerResponse: 'The provider response is recorded.', autoResolved: false,
        createdAt: '2026-08-29T00:00:00.000Z', resolvedAt: null,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
  });
});

it('Bug OPS-320 — the dispute queue sends money decisions to Dispute 360 instead of duplicating a quick-resolve form', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DisputesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Review dispute dispute-12345678 in Dispute 360')).toHaveAttribute(
    'to',
    '/disputes/dispute-12345678',
  );
  expect(screen.queryByRole('button', { name: 'Resolve dispute dispute-12345678' })).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});
