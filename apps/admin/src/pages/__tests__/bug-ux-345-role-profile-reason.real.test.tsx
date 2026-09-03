import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (e: Error) => e.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useSearchParams: () => [new URLSearchParams('tab=roles'), vi.fn()] };
});

import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-345 — role-profile create and archive flows collect reasons in-page and explain that they do not change account access', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [{
      id: 'role-1', name: 'case_reviewer', description: 'Case queue profile', permissions: ['support.view'],
      created_at: '', updated_at: '', staff_count: 0,
    }] } });
    if (url === '/api/v1/staff/permissions') return Promise.resolve({ data: { data: ['support.view'] } });
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><StaffRolesPage /></QueryClientProvider>);

  const createRole = await screen.findByRole('button', { name: 'Create Role' });
  await waitFor(() => expect(createRole).toBeEnabled());
  fireEvent.click(createRole);
  expect(screen.getByLabelText('Reason')).toBeInTheDocument();
  expect(screen.getByText(/does not grant panel access/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
  expect(screen.getByRole('dialog', { name: 'Archive role profile' })).toBeInTheDocument();
  expect(screen.getByLabelText('Reason')).toBeInTheDocument();
  expect(screen.getByText(/does not revoke any account role or active session/i)).toBeInTheDocument();
});
