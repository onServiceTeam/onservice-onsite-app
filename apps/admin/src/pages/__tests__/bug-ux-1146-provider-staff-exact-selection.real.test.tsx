import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn() },
  getErrorMessage: () => 'Request failed',
}));

import { StaffTab } from '../ProviderDetailPage';

it('Bug UX-1146 — an exact Provider 360 staff link selects only the provider-owned member with that canonical ID', async () => {
  get.mockResolvedValue({ data: { success: true, data: [
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', userId: 'user-2', userName: 'Other Member',
      roleTitle: 'Cleaner', status: 'approved', invitePhone: null, inviteEmail: null,
      contactMasked: true, adminDecisionReason: null, isAssignable: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      performance: { totalJobs: 2, totalReviews: 1, averageRating: 5 },
    },
    {
      id: TARGET_ID, userId: 'user-1', userName: 'Selected Member', roleTitle: 'Technician',
      status: 'approved', invitePhone: '09•••••••12', inviteEmail: null, contactMasked: true,
      adminDecisionReason: null, isAssignable: true, createdAt: '2026-07-01T00:00:00.000Z',
      performance: { totalJobs: 10, totalReviews: 8, averageRating: 4.9 },
    },
  ] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <StaffTab providerId="provider-1" exactStaffId={TARGET_ID} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Exact team member evidence')).toBeVisible();
  const selectedName = screen.getByText('Selected Member');
  expect(selectedName.closest('[aria-current="true"]')).not.toBeNull();
  expect(screen.queryByText('Other Member')).not.toBeInTheDocument();
});
