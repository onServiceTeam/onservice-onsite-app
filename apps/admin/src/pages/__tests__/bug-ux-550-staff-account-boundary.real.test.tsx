import React from 'react';
import { render, screen } from '@testing-library/react';
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

it('Bug UX-550 — the staff page does not misrepresent directory controls as account creation, deactivation, or session revocation', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Account lifecycle is not controlled here')).toBeInTheDocument();
  expect(screen.getByText(/does not create or deactivate a login account/i)).toBeInTheDocument();
  expect(screen.getByText(/does not revoke active sessions/i)).toBeInTheDocument();
});
