import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));

import { DisputeActions, type DisputeFullDetail } from '../DisputeDetailPage';

const detail: DisputeFullDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  bookingId: '22222222-2222-4222-8222-222222222222',
  status: 'under_review',
  tier: 1,
  type: 'quality',
  description: 'Customer reports incomplete work.',
  filedBy: 'customer',
  filedAt: '2026-09-03T08:00:00.000Z',
  ageHours: 2,
  priorityScore: 10,
  resolvedAt: null,
  resolvedBy: null,
  resolutionType: null,
  refundAmount: null,
  decisionNotes: null,
  internalNotes: null,
  providerResponse: null,
  providerRespondedAt: null,
  assignedTo: null,
  booking: null,
  customer: null,
  provider: null,
  evidence: [],
};

beforeEach(() => {
  apiGet.mockReset();
  apiGet
    .mockRejectedValueOnce(new Error('active-admin directory offline'))
    .mockResolvedValue({
      data: { success: true, data: [{ id: 'admin-1', first_name: 'Ana', last_name: 'Reyes', role: 'admin' }] },
    });
});

it('Bug UX-1267 - a failed dispute assignee directory offers an in-place retry before assignment', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DisputeActions detail={detail} /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Active admins could not be loaded. Retry before assigning this dispute.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry active admins' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('option', { name: 'Ana Reyes (Admin)' })).toBeInTheDocument();
});
