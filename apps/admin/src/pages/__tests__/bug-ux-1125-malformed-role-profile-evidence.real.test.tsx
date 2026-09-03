import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-1125 - a malformed role-profile audit ID is rejected without requesting an arbitrary record', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/staff/roles' || url === '/api/v1/staff/permissions') return { data: { data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff?tab=roles&roleProfileId=not-a-role']}><StaffRolesPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText(/selected role-profile ID is invalid/i)).toBeVisible();
  expect(apiMocks.get).not.toHaveBeenCalledWith('/api/v1/staff/roles/not-a-role');
});
