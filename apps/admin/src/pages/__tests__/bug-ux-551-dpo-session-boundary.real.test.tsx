import React from 'react';
import { render, screen } from '@testing-library/react';
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
  return { ...actual, useSearchParams: () => [new URLSearchParams('tab=dpo'), vi.fn()] };
});

import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-551 — DPO role changes disclose incomplete route segregation and non-revoked sessions before action', async () => {
  apiGet.mockResolvedValue({ data: { data: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/staff?tab=dpo']}><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Access and session boundary')).toBeInTheDocument();
  expect(screen.getByText(/DPO route segregation is not yet complete/i)).toBeInTheDocument();
  expect(screen.getByText(/does not revoke already-issued login or refresh tokens/i)).toBeInTheDocument();
});
