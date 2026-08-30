import React from 'react';
import { render, screen, within } from '@testing-library/react';
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

it('Bug UX-542 — each staff card separates real account access from directory metadata and links to owned work', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return Promise.resolve({ data: {
      data: [{
        id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        role_id: '33333333-3333-4333-8333-333333333333',
        is_active: true,
        last_login_at: '2026-08-30T03:15:00.000Z',
        user_first_name: 'Ana',
        user_last_name: 'Reyes',
        user_email: 'ana@example.com',
        user_phone: '+639171234567',
        role_name: 'support_agent',
        account_role: 'admin',
        account_is_active: true,
        active_support_cases: '3',
      }],
      meta: { total: 1, summary: {
        totalProfiles: 1, activeProfiles: 1, inactiveProfiles: 0,
        activeAccounts: 1, inactiveAccounts: 0, activeSupportOwners: 1,
        totalAdminAccounts: 1, unprofiledAdminAccounts: 0,
      } },
    } });
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [{
      id: '33333333-3333-4333-8333-333333333333', name: 'support_agent',
      description: 'Support profile', permissions: ['support.view'], created_at: '', updated_at: '',
    }] } });
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/staff']}><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const card = (await screen.findByText('Ana Reyes')).closest('article');
  expect(card).not.toBeNull();
  expect(within(card!).getByText('Actual access role')).toBeInTheDocument();
  expect(within(card!).getAllByText('Admin')).toHaveLength(2);
  expect(within(card!).getByText('Profile active')).toBeInTheDocument();
  expect(within(card!).getByText('3')).toBeInTheDocument();
  expect(within(card!).getByRole('link', { name: 'Open active cases (3)' })).toHaveAttribute(
    'href',
    '/support-tickets?assignedAgentId=22222222-2222-4222-8222-222222222222&active=1&agentName=Ana%20Reyes',
  );
  expect(within(card!).getByRole('link', { name: 'Profile audit' })).toHaveAttribute(
    'href',
    '/audit-log?entityType=admin_staff&entityId=11111111-1111-4111-8111-111111111111',
  );
});
