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

import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-853 — staff summary cards state that their company-wide totals do not follow the result filters', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return Promise.resolve({ data: { data: [], meta: { total: 0, summary: {
      totalProfiles: 12, activeProfiles: 10, inactiveProfiles: 2, activeAccounts: 11, inactiveAccounts: 1,
      activeSupportOwners: 4, totalAdminAccounts: 14, unprofiledAdminAccounts: 2,
    } } } });
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/staff?accountStatus=inactive']}><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const summary = await screen.findByRole('region', { name: 'Staff directory summary' });
  expect(within(summary).getByText('Company-wide counts. Search and filters below change the directory results, not these totals.')).toBeInTheDocument();
  expect(await within(summary).findByText('12')).toBeInTheDocument();
  expect(within(summary).getByText('2')).toBeInTheDocument();
});
