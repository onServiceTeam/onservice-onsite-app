import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import CancellationPolicyPage from '../settings/CancellationPolicyPage';

it('Bug UX-576 — a missing active cancellation policy is a booking hold, not a blank editor', async () => {
  apiGet.mockResolvedValue({ data: { data: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <CancellationPolicyPage />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('No active cancellation policy')).toBeInTheDocument();
  expect(screen.getByText(/must not rely on a missing or inactive cancellation policy/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry policy lookup' })).toBeEnabled();
  expect(screen.queryByText(/Active version/)).not.toBeInTheDocument();
});
