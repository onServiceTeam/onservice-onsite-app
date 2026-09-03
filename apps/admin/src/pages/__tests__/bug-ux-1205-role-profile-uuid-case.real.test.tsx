import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const ROLE_ID = '12050000-abcd-4abc-8def-000000001205';
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

it('Bug UX-1205 - an uppercase Admin role UUID loads the canonical exact profile', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/staff/roles/${ROLE_ID}`) return { data: { success: true, data: {
      id: ROLE_ID, name: 'canonical_reviewer', description: 'Canonical support-review metadata',
      permissions: ['support.view'], active_staff_count: '1', historical_staff_count: '1',
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-09-03T00:00:00.000Z',
      deleted_at: null, deleted_reason: null,
    } } };
    if (url === '/api/v1/staff/roles') return { data: { data: [] } };
    if (url === '/api/v1/staff/permissions') return { data: { data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/staff?tab=roles&roleProfileId=${ROLE_ID.toUpperCase()}`]}><StaffRolesPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Linked current role profile')).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/staff/roles/${ROLE_ID}`);
  expect(screen.getByText(ROLE_ID)).toBeVisible();
});
