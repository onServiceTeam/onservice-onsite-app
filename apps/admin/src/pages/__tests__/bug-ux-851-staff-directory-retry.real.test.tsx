import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-851 — the failed staff-directory source exposes a retry that refetches and restores the results state', async () => {
  let staffAttempts = 0;
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) {
      staffAttempts += 1;
      if (staffAttempts === 1) return Promise.reject(new Error('Staff directory unavailable.'));
      return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    }
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/staff']}><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Retry staff directory' }));
  expect(await screen.findByText('No staff accounts or directory profiles match these filters.')).toBeInTheDocument();
  await waitFor(() => expect(staffAttempts).toBe(2));
});
