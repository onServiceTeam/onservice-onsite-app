import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import DashboardPage from '../DashboardPage';

it('Bug UX-1309 - an acquisition-funnel failure identifies the source and offers retry', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: {
      revenue: 0, revenueTrendPct: 0, activeBookings: 0, pendingDisputes: 0,
      newSignups: 0, pendingApprovals: 0, todayBookings: 0, escalatedDisputes: 0,
      staleDisputes: 0, escrowBalance: 0, platformRevenue: 0, guaranteeFund: 0,
      guaranteeFundRunwayMonths: 99,
    } } });
    if (url.includes('/acquisition-funnel')) return Promise.reject(new Error('funnel offline'));
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Acquisition funnel source unavailable')).toBeInTheDocument();
  const retry = screen.getByRole('button', { name: 'Retry source' });
  const funnelCalls = () => apiGet.mock.calls.filter(([url]) => String(url).includes('/acquisition-funnel')).length;
  const callsBeforeRetry = funnelCalls();
  fireEvent.click(retry);
  await waitFor(() => expect(funnelCalls()).toBeGreaterThan(callsBeforeRetry));
});
