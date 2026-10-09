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
    selector({ user: { role: 'admin' } }),
}));

import DisputesPage from '../DisputesPage';

beforeEach(() => {
  apiMocks.get.mockReset();
  apiMocks.get.mockResolvedValue({
    data: {
      success: true,
      data: [{
        id: 'dispute-12960001', bookingId: 'booking-12960001', filedBy: 'customer-1',
        customerName: 'Maria Santos', providerName: 'Cebu Home Care', type: 'incomplete',
        status: 'resolved', tier: 2, assignedTo: 'admin-1', resolutionType: 'partial_refund',
        // API money contract: 125,000 centavos = ₱1,250.00.
        refundAmount: 125000, refundPercent: 50, decisionNotes: 'Partial refund approved.',
        description: 'The completed work did not match the agreed scope.',
        providerResponse: 'The provider response is recorded.', autoResolved: false,
        createdAt: '2026-08-29T00:00:00.000Z', resolvedAt: '2026-08-29T01:00:00.000Z',
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
  });
});

it('Bug UX-1296 - the dispute queue displays API refund centavos as the correct peso amount', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DisputesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('₱1,250.00')).toBeVisible();
  expect(screen.queryByText('₱125,000.00')).toBeNull();
});
