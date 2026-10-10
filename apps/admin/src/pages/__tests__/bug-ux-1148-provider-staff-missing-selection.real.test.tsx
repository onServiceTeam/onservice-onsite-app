import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn() },
  getErrorMessage: () => 'Request failed',
}));

import { StaffTab } from '../ProviderDetailPage';

it('Bug UX-1148 — Provider 360 shows no substitute when a valid staff evidence ID is absent from the provider team', async () => {
  get.mockResolvedValue({ data: { success: true, data: [{
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', userId: 'user-1', userName: 'Other Member',
    roleTitle: 'Cleaner', status: 'approved', invitePhone: null, inviteEmail: null,
    contactMasked: true, adminDecisionReason: null, isAssignable: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    performance: { totalJobs: 2, totalReviews: 1, averageRating: 5 },
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <StaffTab
        providerId="provider-1"
        exactStaffId="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('No substitute team member is shown');
  expect(screen.queryByText('Other Member')).not.toBeInTheDocument();
  expect(screen.queryByText('Exact team member evidence')).not.toBeInTheDocument();
});
