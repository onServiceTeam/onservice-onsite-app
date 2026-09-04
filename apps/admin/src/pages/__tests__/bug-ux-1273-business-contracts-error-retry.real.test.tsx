import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { ContractsTab } from '../BusinessAccountDetailPage';

it('Bug UX-1273 - a failed business-contract read offers recovery without showing an empty publish queue', async () => {
  apiGet
    .mockRejectedValueOnce(new Error('business contracts source offline'))
    .mockResolvedValueOnce({ data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ContractsTab accountId="business-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Business contracts unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat it as an empty or safe-to-publish queue/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry contracts' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No contracts for this account.')).toBeInTheDocument();
});
