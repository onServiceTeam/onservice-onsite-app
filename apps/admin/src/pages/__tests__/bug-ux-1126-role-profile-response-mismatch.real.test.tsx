import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const REQUESTED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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

it('Bug UX-1126 - a mismatched role response is rejected instead of being shown as the linked exact profile', async () => {
  const wrongRole = {
    id: OTHER_ID, name: 'wrong_profile', description: null, permissions: ['support.view'],
    active_staff_count: '1', historical_staff_count: '1', deleted_at: null, deleted_reason: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/staff/roles/${REQUESTED_ID}`) return { data: { data: wrongRole } };
    if (url === '/api/v1/staff/roles') return { data: { data: [wrongRole] } };
    if (url === '/api/v1/staff/permissions') return { data: { data: ['support.view'] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/staff?tab=roles&roleProfileId=${REQUESTED_ID}`]}><StaffRolesPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Selected role profile could not be loaded')).toBeVisible();
  expect(screen.queryByText(REQUESTED_ID)).not.toBeInTheDocument();
  expect(screen.getByText('Wrong Profile')).toBeVisible();
  expect(screen.queryByText('Linked current role profile')).not.toBeInTheDocument();
});
