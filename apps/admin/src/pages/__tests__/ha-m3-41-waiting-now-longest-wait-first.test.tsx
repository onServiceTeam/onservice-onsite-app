// HA-M3-41 (D38 Milestone 3): the Marketplace page opens on Waiting now and
// lists the requests still waiting for a provider's quote longest wait first,
// then the requests whose quote waits for the customer. Rows are sent out of
// order on purpose: the page must sort them itself. Source: GET
// /api/v1/admin/marketplace-health/open-requests. (The badges and the
// customer-wait rows have their own tests, HA-M3-221 and HA-M3-222.)
import React from 'react';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import MarketplacePage from '../MarketplacePage';
import {
  MARKETPLACE, minutesAgo, openRequest, openRequestsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-41: Waiting now lists provider waits longest first, then the requests waiting on the customer', async () => {
  const now = Date.now();
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) {
      return openRequestsResponse([
        openRequest({ bookingId: 'customer-30', waitingOn: 'customer', liveQuotes: 1, waitingSince: minutesAgo(30.3, now), waitMinutes: 30 }),
        openRequest({ bookingId: 'providers-3', waitingSince: minutesAgo(3.3, now), waitMinutes: 3 }),
        openRequest({ bookingId: 'providers-7', waitingSince: minutesAgo(7.3, now), waitMinutes: 7, severity: 'amber' }),
        openRequest({ bookingId: 'providers-12', waitingSince: minutesAgo(12.3, now), waitMinutes: 12, severity: 'red' }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplacePage />, { route: '/marketplace' });

  // The first render can be slow while the whole suite runs in parallel.
  await screen.findByText('Waiting 12 min', {}, { timeout: 5_000 });
  const rows = screen.getAllByTestId('waiting-row');
  expect(rows.map((row) => row.getAttribute('data-booking-id'))).toEqual([
    'providers-12', 'providers-7', 'providers-3', 'customer-30',
  ]);
});
