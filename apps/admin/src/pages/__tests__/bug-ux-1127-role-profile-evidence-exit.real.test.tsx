import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const ROLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FILTER_ROLE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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

function LocationEvidence(): React.ReactElement {
  return <output aria-label="Current Staff query">{useLocation().search}</output>;
}

it('Bug UX-1127 - clearing exact role evidence preserves existing Staff workspace filters and page state', async () => {
  const role = {
    id: ROLE_ID, name: 'case_reviewer', description: 'Case review metadata', permissions: ['support.view'],
    active_staff_count: '2', historical_staff_count: '2', deleted_at: null, deleted_reason: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-03T00:00:00.000Z',
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/staff/roles/${ROLE_ID}`) return { data: { data: role } };
    if (url === '/api/v1/staff/roles') return { data: { data: [] } };
    if (url === '/api/v1/staff/permissions') return { data: { data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const initial = `/staff?tab=roles&roleProfileId=${ROLE_ID}&roleId=${FILTER_ROLE_ID}&page=2`;

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initial]}><LocationEvidence /><StaffRolesPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Linked current role profile')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.queryByText('Linked current role profile')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Current Staff query')).toHaveTextContent(`?tab=roles&roleId=${FILTER_ROLE_ID}&page=2`);
});
