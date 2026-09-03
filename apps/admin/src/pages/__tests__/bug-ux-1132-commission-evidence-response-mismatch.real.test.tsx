import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const REQUESTED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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

const wrongRate = {
  id: OTHER_ID, scopeType: 'tier', tier: 'new', providerId: null, providerName: null,
  providerTier: null, serviceCategoryId: null, categoryName: null, serviceSubcategoryId: null,
  subcategoryName: null, rateBasisPoints: 1500, ratePercent: 15,
  effectiveFrom: '2026-10-01T00:00:00.000Z', reason: 'Different agreement.',
  source: 'admin_schedule', createdByName: 'Finance Owner', approvedByName: 'Finance Owner',
  createdAt: '2026-09-03T10:00:00.000Z', cancellation: null,
  snapshotUsageCount: 0, lifecycleStatus: 'scheduled',
};

it('Bug UX-1132 - a mismatched exact commission response is rejected instead of substituting a list record', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/financials/commission-controls/${REQUESTED_ID}`) return { data: { data: wrongRate } };
    if (url === '/api/v1/admin/financials/commission-controls') return { data: { data: { items: [wrongRate], total: 1 } } };
    if (url === '/api/v1/catalog/admin/full') return { data: { data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/financials?tab=commission&commissionRateId=${REQUESTED_ID}`]}><FinancialsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Selected commission agreement could not be loaded')).toBeVisible();
  expect(screen.getByText(/different commission agreement/i)).toBeVisible();
  expect(screen.queryByText(REQUESTED_ID)).not.toBeInTheDocument();
  expect(screen.queryByText('Selected commission agreement evidence')).not.toBeInTheDocument();
  expect(screen.getByText('Different agreement.')).toBeVisible();
});
