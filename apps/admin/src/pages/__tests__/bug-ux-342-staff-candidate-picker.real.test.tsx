import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (e: Error) => e.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-342 — adding staff uses a named admin-tier candidate picker instead of a pasted user ID', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [{
      id: 'role-1', name: 'support_agent', description: null, permissions: ['support.view'],
      created_at: '', updated_at: '', staff_count: 0,
    }] } });
    if (url === '/api/v1/staff/candidates') return Promise.resolve({ data: { data: [{
      id: 'admin-1', first_name: 'Ana', last_name: 'Reyes', email: 'ana@example.com',
      phone: '+639171234567', role: 'admin',
    }] } });
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Add Staff' }));
  expect(screen.getByLabelText('Find admin-tier account')).toBeInTheDocument();
  expect(screen.queryByLabelText('User ID')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Find admin-tier account'), { target: { value: 'Ana' } });
  expect(await screen.findByRole('option', { name: /Ana Reyes \(Admin\)/ })).toBeInTheDocument();
  expect(screen.getByText(/Account roles and server RBAC remain the access source/)).toBeInTheDocument();
});
