import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-1131 - a malformed commission audit target fails closed without requesting an arbitrary agreement', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/financials/commission-controls') return { data: { data: { items: [], total: 0 } } };
    if (url === '/api/v1/catalog/admin/full') return { data: { data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/financials?tab=commission&commissionRateId=not-an-agreement']}><FinancialsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText(/invalid commission-agreement ID/i)).toBeVisible();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith(
    '/api/v1/admin/financials/commission-controls', expect.anything(),
  ));
  expect(apiMocks.get).not.toHaveBeenCalledWith('/api/v1/admin/financials/commission-controls/not-an-agreement');
});
