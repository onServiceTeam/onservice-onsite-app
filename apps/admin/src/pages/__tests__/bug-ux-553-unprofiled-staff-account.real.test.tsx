import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useSearchParams: () => [new URLSearchParams(), vi.fn()] };
});

import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-553 — an admin account without a profile still exposes its support workload and a safe profile-preparation path', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return Promise.resolve({ data: {
      data: [{
        id: '22222222-2222-4222-8222-222222222222', profile_id: null,
        user_id: '22222222-2222-4222-8222-222222222222', role_id: null, is_active: null,
        last_login_at: null, user_first_name: 'Ana', user_last_name: 'Reyes',
        user_email: 'ana@example.com', user_phone: '+639171234567', role_name: null,
        account_role: 'admin', account_is_active: true, active_support_cases: '2',
      }],
      meta: { total: 1, summary: {
        totalProfiles: 0, activeProfiles: 0, inactiveProfiles: 0,
        activeAccounts: 1, inactiveAccounts: 0, activeSupportOwners: 1,
        totalAdminAccounts: 1, unprofiledAdminAccounts: 1,
      } },
    } });
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [{
      id: '33333333-3333-4333-8333-333333333333', name: 'support_agent',
      description: '', permissions: ['support.view'], created_at: '', updated_at: '',
    }] } });
    if (url === '/api/v1/staff/candidates') return Promise.resolve({ data: { data: [{
      id: '22222222-2222-4222-8222-222222222222', first_name: 'Ana', last_name: 'Reyes',
      email: 'ana@example.com', phone: '+639171234567', role: 'admin',
    }] } });
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const card = (await screen.findByText('Ana Reyes')).closest('article');
  expect(card).not.toBeNull();
  expect(within(card!).getByText('No directory profile')).toBeInTheDocument();
  expect(within(card!).getByRole('link', { name: 'Open active cases (2)' })).toBeInTheDocument();
  expect(within(card!).queryByRole('link', { name: 'Profile audit' })).not.toBeInTheDocument();
  expect(within(card!).queryByRole('button', { name: 'Archive profile' })).not.toBeInTheDocument();
  fireEvent.click(within(card!).getByRole('button', { name: 'Prepare directory profile' }));
  expect((await screen.findAllByLabelText('Directory role profile')).some((element) => element.id === 'staff-role-id')).toBe(true);
  expect(await screen.findByRole('option', { name: /Ana Reyes \(Admin\)/ })).toBeInTheDocument();
});
