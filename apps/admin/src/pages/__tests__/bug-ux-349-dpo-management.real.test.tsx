import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  return { ...actual, useSearchParams: () => [new URLSearchParams('tab=dpo'), vi.fn()] };
});

import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-349 — the admin app provides a governed DPO assignment workspace instead of relying on an undocumented API call', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/staff/dpos') return Promise.resolve({ data: { data: [] } });
    if (url === '/api/v1/staff/dpo-candidates') return Promise.resolve({ data: { data: [{
      id: 'admin-2', first_name: 'Ana', last_name: 'Reyes', email: 'ana@example.com', phone: '+639171234567', role: 'admin',
    }] } });
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><StaffRolesPage /></QueryClientProvider>);

  expect(await screen.findByText('Data Protection Officer seat')).toBeInTheDocument();
  expect(screen.getByText(/actual account-role change/i)).toBeInTheDocument();
  expect(await screen.findByText('DPO seat vacant')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Find active admin account'), { target: { value: 'Ana' } });
  expect(await screen.findByRole('option', { name: 'Ana Reyes' })).toBeInTheDocument();
  expect(screen.getByLabelText('Assignment reason')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Assign DPO' })).toBeInTheDocument();
});
