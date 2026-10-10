import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const REQUESTED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import MarketingPage from '../MarketingPage';

it('Bug UX-1116 - a mismatched campaign response is rejected instead of being shown as the selected audit record', async () => {
  const wrongCampaign = {
    id: OTHER_ID, name: 'Wrong campaign', channel: 'facebook_ads', startedAt: '2026-09-01T00:00:00.000Z',
    endedAt: null, spendCentavos: 0, attributedSignups: 0, attributedFirstBookings: 0,
    attributedRevenueCentavos: 0, notes: null, createdAt: '2026-09-01T00:00:00.000Z', cpaCentavos: 0, roiPercent: 0,
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/marketing/campaigns/${REQUESTED_ID}`) return { data: { success: true, data: wrongCampaign } };
    if (url === '/api/v1/admin/marketing/channels') return { data: { success: true, data: ['facebook_ads'] } };
    if (url === '/api/v1/admin/marketing/campaigns/channels') return { data: { success: true, data: ['facebook_ads'] } };
    if (url === '/api/v1/admin/marketing/campaigns') return { data: { success: true, data: { rows: [wrongCampaign], total: 1 } } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/marketing?tab=campaigns&campaignId=${REQUESTED_ID}`]}><MarketingPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Selected campaign could not be loaded')).toBeVisible();
  expect(screen.queryByText(REQUESTED_ID)).not.toBeInTheDocument();
  expect(screen.getByText('Wrong campaign')).toBeVisible();
});
