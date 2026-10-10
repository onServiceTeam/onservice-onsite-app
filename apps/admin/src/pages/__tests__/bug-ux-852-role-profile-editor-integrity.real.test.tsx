import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get: apiMocks.get, post: apiMocks.post, put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useSearchParams: () => [new URLSearchParams('tab=roles'), vi.fn()] };
});

import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-852 — the role-profile editor bounds audit fields and remains visibly pending until the server confirms creation', async () => {
  apiMocks.get.mockImplementation((url: string) => {
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [] } });
    if (url === '/api/v1/staff/permissions') return Promise.resolve({ data: { data: ['support.read'] } });
    return Promise.resolve({ data: { data: [] } });
  });
  let finishCreate: (() => void) | undefined;
  apiMocks.post.mockImplementation(() => new Promise<void>((resolve) => { finishCreate = resolve; }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/staff']}><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const createRole = await screen.findByRole('button', { name: 'Create Role' });
  await waitFor(() => expect(createRole).toBeEnabled());
  fireEvent.click(createRole);
  const name = screen.getByLabelText('Role name');
  const description = screen.getByLabelText('Role description');
  const reason = screen.getByLabelText('Reason');
  expect(name).toHaveAttribute('maxLength', '50');
  expect(description).toHaveAttribute('maxLength', '500');
  expect(reason).toHaveAttribute('maxLength', '5000');
  fireEvent.change(name, { target: { value: 'support_lead' } });
  fireEvent.change(description, { target: { value: 'Owns escalated cases.' } });
  fireEvent.click(screen.getByLabelText('support.read'));
  fireEvent.change(reason, { target: { value: 'Create a profile for escalated support ownership.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));

  expect(await screen.findByRole('button', { name: 'Creating...' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(apiMocks.post).toHaveBeenCalledWith('/api/v1/staff/roles', {
    name: 'support_lead',
    description: 'Owns escalated cases.',
    permissions: ['support.read'],
    reason: 'Create a profile for escalated support ownership.',
  });

  await act(async () => { finishCreate?.(); });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Creating...' })).not.toBeInTheDocument());
});
