import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const getMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: getMock, post: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import MarketingPage from '../MarketingPage';

it('Bug UX-686 — campaigns use configured channels and cannot masquerade as a messaging or attribution-editing tool', async () => {
  getMock.mockImplementation((url: string) => {
    if (url === '/api/v1/config') return Promise.resolve({ data: { data: { featureFlags: { promoRedemptionEnabled: false, abTestingEnabled: false } } } });
    if (url.endsWith('/overview')) return Promise.resolve({ data: { data: {
      totalSpendCentavos: 0, totalSignups: 0, totalRevenueCentavos: 0,
      aggregateCpaCentavos: 0, aggregateRoiPercent: 0, channelBreakdown: [],
    } } });
    if (url.endsWith('/channels')) return Promise.resolve({ data: { data: ['tiktok_ads', 'community_partnership'] } });
    if (url.endsWith('/campaigns')) return Promise.resolve({ data: { data: { rows: [{
      id: 'campaign-1', name: 'Cebu launch', channel: 'tiktok_ads',
      startedAt: '2026-08-01T00:00:00.000Z', endedAt: null, spendCentavos: 100_000,
      attributedSignups: 15, attributedFirstBookings: 4, attributedRevenueCentavos: 250_000,
      notes: null, createdAt: '2026-08-01T00:00:00.000Z', cpaCentavos: 6_667, roiPercent: 150,
    }], total: 1 } } });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><MarketingPage /></MemoryRouter></QueryClientProvider>);

  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Campaigns' }), { button: 0, ctrlKey: false });
  expect(await screen.findByText('Tracking records only')).toBeVisible();
  expect(screen.getByText(/does not send SMS, email, push notifications/i)).toBeVisible();
  const channelFilter = screen.getByLabelText('Channel');
  expect(await within(channelFilter).findByRole('option', { name: 'Tiktok Ads' })).toBeVisible();
  expect(await within(channelFilter).findByRole('option', { name: 'Community Partnership' })).toBeVisible();
  fireEvent.click(await screen.findByRole('button', { name: /Edit/i }));
  expect(screen.getByText(/cannot be overwritten here/i)).toBeVisible();
  expect(screen.queryByLabelText('Signups')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Revenue (centavos)')).not.toBeInTheDocument();
});
