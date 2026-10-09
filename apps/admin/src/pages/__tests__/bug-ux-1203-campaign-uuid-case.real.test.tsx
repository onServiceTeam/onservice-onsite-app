import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CAMPAIGN_ID = '12030000-abcd-4abc-8def-000000001203';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import MarketingPage from '../MarketingPage';

it('Bug UX-1203 - an uppercase campaign UUID loads the canonical exact audit record', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/marketing/campaigns/${CAMPAIGN_ID}`) return { data: { success: true, data: {
      id: CAMPAIGN_ID, name: 'Canonical campaign', channel: 'facebook_ads',
      startedAt: '2026-09-01T00:00:00.000Z', endedAt: null, spendCentavos: 250000,
      attributedSignups: 12, attributedFirstBookings: 4, attributedRevenueCentavos: 600000,
      notes: 'Verified tracking record', createdAt: '2026-08-31T00:00:00.000Z', cpaCentavos: 20833, roiPercent: 140,
    } } };
    if (url === '/api/v1/admin/marketing/channels' || url === '/api/v1/admin/marketing/campaigns/channels') return { data: { success: true, data: ['facebook_ads'] } };
    if (url === '/api/v1/admin/marketing/campaigns') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/marketing?campaignId=${CAMPAIGN_ID.toUpperCase()}`]}><MarketingPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Canonical campaign')).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/admin/marketing/campaigns/${CAMPAIGN_ID}`);
  expect(screen.getByText(CAMPAIGN_ID)).toBeVisible();
});
