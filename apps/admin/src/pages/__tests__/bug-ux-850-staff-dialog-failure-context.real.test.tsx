import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get: apiMocks.get, post: vi.fn(), put: apiMocks.put, delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-850 — a failed staff role-profile update preserves the target and reason in the open confirmation', async () => {
  apiMocks.get.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return Promise.resolve({ data: {
      data: [{
        id: '11111111-1111-4111-8111-111111111111',
        profile_id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        role_id: '33333333-3333-4333-8333-333333333333',
        is_active: true,
        last_login_at: null,
        created_at: '2026-08-31T00:00:00.000Z',
        user_first_name: 'Ana',
        user_last_name: 'Reyes',
        user_email: 'ana@example.com',
        role_name: 'support_agent',
        account_role: 'admin',
        account_is_active: true,
        active_support_cases: '0',
      }],
      meta: { total: 1 },
    } });
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [
      { id: '33333333-3333-4333-8333-333333333333', name: 'support_agent', description: '', permissions: ['support.read'], created_at: '', updated_at: '' },
      { id: '44444444-4444-4444-8444-444444444444', name: 'support_lead', description: '', permissions: ['support.read'], created_at: '', updated_at: '' },
    ] } });
    return Promise.resolve({ data: { data: [] } });
  });
  apiMocks.put.mockRejectedValue(new Error('Directory update unavailable.'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/staff']}><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.change(await screen.findByLabelText('Change directory profile for Ana Reyes'), {
    target: { value: '44444444-4444-4444-8444-444444444444' },
  });
  const dialog = screen.getByRole('dialog', { name: 'Change directory role profile' });
  const reason = within(dialog).getByLabelText('Reason');
  fireEvent.change(reason, { target: { value: 'Move escalated support ownership to this profile.' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm change' }));

  await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Directory update unavailable.'));
  expect(screen.getByRole('dialog', { name: 'Change directory role profile' })).toBeInTheDocument();
  expect(reason).toHaveValue('Move escalated support ownership to this profile.');
  expect(apiMocks.put).toHaveBeenCalledWith('/api/v1/staff/11111111-1111-4111-8111-111111111111', {
    roleId: '44444444-4444-4444-8444-444444444444',
    reason: 'Move escalated support ownership to this profile.',
  });
});
