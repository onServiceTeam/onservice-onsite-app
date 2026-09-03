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

it('Bug UX-1147 — Provider 360 rejects a malformed staff evidence ID before requesting the team list', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StaffTab providerId="provider-1" exactStaffId="not-a-uuid" />
    </QueryClientProvider>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Team member ID must be a complete UUID');
  expect(screen.queryByText('Exact team member evidence')).not.toBeInTheDocument();
  expect(get).not.toHaveBeenCalled();
});
