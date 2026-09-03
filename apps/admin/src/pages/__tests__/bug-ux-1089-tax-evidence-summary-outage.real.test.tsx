import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const BATCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get: apiMocks.get, post: vi.fn() },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => (
    selector({ user: { role: 'super_admin' } })
  ),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-1089 - exact retained tax evidence remains available when the annual summary request fails', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/bir/overview') throw new Error('Summary service unavailable');
    if (url === `/api/v1/admin/bir/2307/${BATCH_ID}`) return { data: { data: {
      id: BATCH_ID, providerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      providerName: 'Cebu Service Co.', taxYear: 2026, taxQuarter: 3,
      grossIncome: 60000000, withholdingRate: 0.01, withheldAmount: 100000,
      pdfUrl: null, issuedAt: '2026-09-03T08:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/bir/2307/quarter/2026/3') {
      return { data: { data: { rows: [], total: 0 } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/financials?tab=bir&taxYear=2026&taxQuarter=3&batchId=${BATCH_ID}`]}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Exact 2307 Workpaper Evidence' })).toBeVisible();
  expect(await screen.findByText(BATCH_ID)).toBeVisible();
  expect(await screen.findByText('Tax workpaper summary unavailable')).toBeVisible();
  expect(screen.getByText(/Exact retained evidence above remains independently available/i)).toBeVisible();
});
