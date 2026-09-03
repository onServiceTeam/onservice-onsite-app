import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const FIRST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import MarketingPage from '../MarketingPage';

it('Bug UX-1114 - simultaneous Marketing audit targets fail closed without loading either record', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/marketing/overview') return { data: { data: {
      totalSpendCentavos: 0, totalSignups: 0, totalRevenueCentavos: 0,
      aggregateCpaCentavos: 0, aggregateRoiPercent: 0, channelBreakdown: [],
    } } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/marketing?promotionId=${FIRST_ID}&campaignId=${SECOND_ID}`]}><MarketingPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText(/contains more than one exact record/i)).toBeVisible();
  expect(apiMocks.get).not.toHaveBeenCalledWith(`/api/v1/promotions/${FIRST_ID}`);
  expect(apiMocks.get).not.toHaveBeenCalledWith(`/api/v1/admin/marketing/campaigns/${SECOND_ID}`);
});
