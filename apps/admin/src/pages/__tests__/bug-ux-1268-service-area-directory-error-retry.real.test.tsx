import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));

import ServiceAreasPage from '../ServiceAreasPage';

beforeEach(() => {
  let listAttempts = 0;
  apiGet.mockReset();
  apiGet.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/service-areas') {
      listAttempts += 1;
      if (listAttempts === 1) throw new Error('service-area directory offline');
      return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    }
    if (url === '/api/v1/admin/service-areas/stats') {
      return { data: { success: true, data: { totalAreas: 0, activeAreas: 0, totalProviders: 0, totalWaitlist: 0, areasByStatus: {} } } };
    }
    if (url === '/api/v1/admin/service-area-changes') return { data: { success: true, data: [] } };
    throw new Error(`Unexpected GET: ${url}`);
  });
});

it('Bug UX-1268 - a failed service-area directory read does not render a false empty table and recovers through retry', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ServiceAreasPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Failed to load service areas.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry service areas' })).toBeInTheDocument();
  expect(screen.queryByText('No service areas found.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry service areas' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(4));
  expect(await screen.findByText('No service areas found.')).toBeInTheDocument();
});
