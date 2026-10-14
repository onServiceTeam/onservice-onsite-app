// HA-M3-209 (D38 Milestone 3, review gap): the Command Center's "Requests
// waiting more than N minutes" card follows new marketplace alerts. When
// alert:new arrives, the card asks GET /marketplace-health/summary again and
// shows the new count without waiting for its 60-second reload.
import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
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

const SUMMARY = '/api/v1/admin/marketplace-health/summary';
const kpis = {
  revenue: 0, revenueTrendPct: 0, activeBookings: 0, pendingDisputes: 0,
  newSignups: 0, pendingApprovals: 0, todayBookings: 0, escalatedDisputes: 0,
  staleDisputes: 0, escrowBalance: 0, platformRevenue: 0, guaranteeFund: 0,
  guaranteeFundRunwayMonths: 99,
};

it('HA-M3-209: an alert:new event reloads the dashboard waiting card and it shows the new count', async () => {
  let summaryCalls = 0;
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: kpis } });
    if (url.includes('/acquisition-funnel')) {
      return Promise.resolve({ data: { data: { registered: 0, firstBooking: 0, repeatBooking: 0 } } });
    }
    if (url === SUMMARY) {
      summaryCalls += 1;
      return Promise.resolve({ data: { success: true, data: {
        waitingCount: 9, waitingOverAmber: summaryCalls === 1 ? 4 : 6, waitingOverRed: 2, awaitingCustomer: 0,
        openAlerts: 6, unacknowledgedAlerts: 6, amberMinutes: 5, redMinutes: 10,
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
  const card = await screen.findByRole('link', { name: 'Open Requests waiting more than 5 minutes queue' });
  expect(within(card).getByText('4')).toBeInTheDocument();

  act(() => {
    socket.handlers.get('alert:new')?.({ id: 'alert-209', source: 'marketplace', kind: 'request_waiting_amber' });
  });

  expect(await within(card).findByText('6')).toBeInTheDocument();
  expect(summaryCalls).toBe(2);
});
