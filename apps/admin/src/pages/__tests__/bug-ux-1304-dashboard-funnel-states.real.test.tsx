import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import DashboardPage from '../DashboardPage';

const kpis = {
  revenue: 0, revenueTrendPct: 0, activeBookings: 0, pendingDisputes: 0,
  newSignups: 0, pendingApprovals: 0, todayBookings: 0, escalatedDisputes: 0,
  staleDisputes: 0, escrowBalance: 0, platformRevenue: 0, guaranteeFund: 0,
  guaranteeFundRunwayMonths: 99,
};

function setResponses(funnelResponse: unknown): void {
  apiGet.mockReset();
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: kpis } });
    if (url.includes('/acquisition-funnel')) return funnelResponse;
    return Promise.resolve({ data: { data: [] } });
  });
}

beforeEach(() => setResponses(Promise.resolve({ data: { data: null } })));

it('Bug UX-1304 - an empty acquisition-funnel response is explained instead of leaving a blank card', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('No acquisition data yet')).toBeInTheDocument();
});

it('Bug UX-1305 - an acquisition-funnel failure identifies the source and offers retry', async () => {
  const funnelRequest = Promise.reject(new Error('funnel offline'));
  setResponses(funnelRequest);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Acquisition funnel source unavailable')).toBeInTheDocument();
  const retry = screen.getByRole('button', { name: 'Retry source' });
  expect(retry).toBeInTheDocument();
  const callsBeforeRetry = apiGet.mock.calls.length;
  fireEvent.click(retry);
  await waitFor(() => expect(apiGet.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
});
