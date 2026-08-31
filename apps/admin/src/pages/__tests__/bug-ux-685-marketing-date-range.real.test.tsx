import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const getMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: getMock },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import MarketingPage from '../MarketingPage';

it('Bug UX-685 — marketing overview blocks a reversed date range before requesting it', async () => {
  getMock.mockImplementation((url: string) => {
    if (url === '/api/v1/config') return Promise.resolve({ data: { data: { featureFlags: { promoRedemptionEnabled: false, abTestingEnabled: false } } } });
    if (url.endsWith('/overview')) return Promise.resolve({ data: { data: {
      totalSpendCentavos: 0, totalSignups: 0, totalRevenueCentavos: 0,
      aggregateCpaCentavos: 0, aggregateRoiPercent: 0, channelBreakdown: [],
    } } });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><MarketingPage /></MemoryRouter></QueryClientProvider>);

  fireEvent.change(await screen.findByLabelText('From'), { target: { value: '2026-09-30' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01' } });
  const before = getMock.mock.calls.filter(([url]) => String(url).endsWith('/overview')).length;
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

  expect(screen.getByRole('alert')).toHaveTextContent('From date cannot be after To date.');
  expect(getMock.mock.calls.filter(([url]) => String(url).endsWith('/overview'))).toHaveLength(before);
});
