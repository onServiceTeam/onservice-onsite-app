import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get: apiMocks.get, post: vi.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => (
    selector({ user: { role: 'super_admin' } })
  ),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-1087 - malformed saved tax evidence state is rejected before any exact evidence request', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/bir/overview') return { data: { data: {
      year: 2026, totalOutputVat: 0, totalVatPayable: 0, monthsFinalized: 0,
      monthlyReports: [], quarterlyBatches: [],
    } } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials?tab=bir&taxYear=2026&taxQuarter=3&batchId=not-a-uuid']}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Invalid tax-workpaper evidence link')).toBeVisible();
  expect(screen.getByText(/2307 batch ID must be a complete UUID/i)).toBeVisible();
  expect(apiMocks.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/bir\/2307\//));
});
