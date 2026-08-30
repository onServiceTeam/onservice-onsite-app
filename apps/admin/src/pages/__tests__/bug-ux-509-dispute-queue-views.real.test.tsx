import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));

import DisputesPage from '../DisputesPage';

function LocationProbe(): React.ReactElement {
  return <output data-testid="location">{useLocation().search}</output>;
}

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockResolvedValue({
    data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
  });
});

it('Bug UX-509 — Dashboard dispute views remain visible, URL-bound, and forwarded to the server instead of silently opening an unfiltered table', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/disputes?view=stale']}>
        <DisputesPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const view = await screen.findByRole('combobox', { name: 'Filter disputes by operational view' });
  expect(view).toHaveValue('stale');
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/v1/disputes', {
    params: expect.objectContaining({ view: 'stale' }),
  }));

  fireEvent.change(view, { target: { value: 'active' } });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?view=active'));
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/v1/disputes', {
    params: expect.objectContaining({ view: 'active' }),
  }));
});
