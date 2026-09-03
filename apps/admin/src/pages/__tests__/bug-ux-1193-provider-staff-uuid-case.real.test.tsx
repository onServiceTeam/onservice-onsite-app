import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const STAFF_ID = '11930000-0000-4abc-8def-000000001193';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn() },
  getErrorMessage: () => 'Request failed',
}));

import { StaffTab } from '../ProviderDetailPage';

it('Bug UX-1193 - a valid uppercase staff UUID resolves to the canonical exact team member', async () => {
  get.mockResolvedValueOnce({ data: { success: true, data: [{
    id: STAFF_ID,
    userId: 'user-1',
    userName: 'Canonical Team Member',
    roleTitle: 'Technician',
    status: 'approved',
    invitePhone: null,
    inviteEmail: null,
    contactMasked: true,
    adminDecisionReason: null,
    isAssignable: true,
    createdAt: '2026-09-03T13:12:00.000Z',
    performance: { totalJobs: 4, totalReviews: 2, averageRating: 5 },
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <StaffTab providerId="provider-1" exactStaffId={STAFF_ID.toUpperCase()} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Canonical Team Member')).toBeVisible();
  expect(screen.getByText('Canonical Team Member').closest('[aria-current="true"]')).not.toBeNull();
  expect(screen.queryByText(/No substitute team member is shown/i)).not.toBeInTheDocument();
});
