import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import MarketingPage from '../MarketingPage';

it('Bug UX-1118 - ordinary Admin accounts see an explicit read-only home-banner boundary', async () => {
  apiMocks.get.mockImplementation((url: string) => {
    if (url.endsWith('/overview')) return Promise.resolve({ data: { data: {
      totalSpendCentavos: 0,
      totalSignups: 0,
      totalRevenueCentavos: 0,
      aggregateCpaCentavos: 0,
      aggregateRoiPercent: 0,
      channelBreakdown: [],
    } } });
    if (url === '/api/v1/promotions') return Promise.resolve({ data: {
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    } });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><MarketingPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Home Banners' }), { button: 0, ctrlKey: false });
  expect(await screen.findByText(/Your Admin role has read-only access/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /Create draft banner/i })).not.toBeInTheDocument();
});
