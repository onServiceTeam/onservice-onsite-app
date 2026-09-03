import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const RATE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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

function LocationEvidence(): React.ReactElement {
  return <output aria-label="Current financials query">{useLocation().search}</output>;
}

it('Bug UX-1135 - leaving Commission Controls removes the hidden exact audit target', async () => {
  const rate = {
    id: RATE_ID, scopeType: 'tier', tier: 'verified', providerId: null, providerName: null,
    providerTier: null, serviceCategoryId: null, categoryName: null, serviceSubcategoryId: null,
    subcategoryName: null, rateBasisPoints: 1300, ratePercent: 13,
    effectiveFrom: '2026-10-01T00:00:00.000Z', reason: 'Approved Verified tier agreement.',
    source: 'admin_schedule', createdByName: 'Finance Owner', approvedByName: 'Finance Owner',
    createdAt: '2026-09-03T10:00:00.000Z', cancellation: null,
    snapshotUsageCount: 0, lifecycleStatus: 'scheduled',
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/financials/commission-controls/${RATE_ID}`) return { data: { data: rate } };
    if (url === '/api/v1/admin/financials/commission-controls') return { data: { data: { items: [], total: 0 } } };
    if (url === '/api/v1/catalog/admin/full') return { data: { data: [] } };
    throw new Error(`Unavailable in this focused test: ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/financials?tab=commission&commissionRateId=${RATE_ID}&source=audit`]}>
        <LocationEvidence />
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Selected commission agreement evidence')).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Payouts' }));
  await waitFor(() => {
    expect(screen.getByLabelText('Current financials query')).toHaveTextContent('?tab=payouts&source=audit');
  });
  expect(screen.queryByText('Selected commission agreement evidence')).not.toBeInTheDocument();
});
