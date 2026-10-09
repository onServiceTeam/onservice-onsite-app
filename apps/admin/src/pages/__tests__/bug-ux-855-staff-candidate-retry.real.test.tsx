import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

it('Bug UX-855 — a failed staff-candidate search can be retried without clearing the operator search', async () => {
  let candidateAttempts = 0;
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [{
      id: '11111111-1111-4111-8111-111111111111', name: 'support_agent', description: '',
      permissions: ['support.read'], created_at: '', updated_at: '',
    }] } });
    if (url === '/api/v1/staff/candidates') {
      candidateAttempts += 1;
      if (candidateAttempts === 1) return Promise.reject(new Error('Candidate search unavailable.'));
      return Promise.resolve({ data: { data: [{
        id: '22222222-2222-4222-8222-222222222222', first_name: 'Ana', last_name: 'Reyes',
        email: 'ana@example.com', phone: '+639171234567', role: 'admin',
      }] } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Add directory profile' }));
  const search = screen.getByLabelText('Find admin-tier account');
  fireEvent.change(search, { target: { value: 'Ana' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Retry admin-tier account search' }));

  expect(await screen.findByRole('option', { name: /Ana Reyes \(Admin\)/ })).toBeInTheDocument();
  expect(search).toHaveValue('Ana');
  await waitFor(() => expect(candidateAttempts).toBe(2));
});
