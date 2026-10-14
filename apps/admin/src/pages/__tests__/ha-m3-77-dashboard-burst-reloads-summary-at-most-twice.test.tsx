// HA-M3-77 (D38 Milestone 3, review fix): on the Command Center a burst of
// alert:new events (the sweep sends one per new alert, up to 50) reloads the
// marketplace summary behind the "Requests waiting" card once at the first
// event and at most once more when the burst window closes, instead of once
// per event. Real timers; the test waits out one window.
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
const socket = vi.hoisted(() => ({ handlers: new Map<string, (payload: unknown) => void>() }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));
vi.mock('@/lib/use-admin-socket', () => ({
  useAdminSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    socket.handlers.set(event, handler);
  },
}));

import DashboardPage from '../DashboardPage';
import { ALERT_REFRESH_WINDOW_MS } from '@/components/marketplace/use-coalesced-callback';

const SUMMARY = '/api/v1/admin/marketplace-health/summary';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const kpis = {
  revenue: 0, revenueTrendPct: 0, activeBookings: 0, pendingDisputes: 0,
  newSignups: 0, pendingApprovals: 0, todayBookings: 0, escalatedDisputes: 0,
  staleDisputes: 0, escrowBalance: 0, platformRevenue: 0, guaranteeFund: 0,
  guaranteeFundRunwayMonths: 99,
};

function summaryCalls(): number {
  return apiGet.mock.calls.filter(([url]) => url === SUMMARY).length;
}

it('HA-M3-77: a burst of five alert:new events reloads the dashboard waiting summary twice at most', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: kpis } });
    if (url.includes('/acquisition-funnel')) {
      return Promise.resolve({ data: { data: { registered: 0, firstBooking: 0, repeatBooking: 0 } } });
    }
    if (url === SUMMARY) {
      return Promise.resolve({ data: { success: true, data: {
        waitingCount: 2, waitingOverAmber: 1, waitingOverRed: 0, awaitingCustomer: 0,
        openAlerts: 1, unacknowledgedAlerts: 1, amberMinutes: 5, redMinutes: 10,
      } } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('link', { name: 'Open Requests waiting more than 5 minutes queue' })).toBeInTheDocument();
  expect(summaryCalls()).toBe(1);

  act(() => {
    for (let index = 0; index < 5; index += 1) {
      socket.handlers.get('alert:new')?.({ id: `alert-burst-${index}`, source: 'marketplace', kind: 'request_waiting_amber' });
    }
  });
  await act(async () => {
    await sleep(ALERT_REFRESH_WINDOW_MS / 3);
  });
  expect(summaryCalls()).toBe(2);

  await act(async () => {
    await sleep(ALERT_REFRESH_WINDOW_MS + 500);
  });
  expect(summaryCalls()).toBe(3);
}, 15_000);
