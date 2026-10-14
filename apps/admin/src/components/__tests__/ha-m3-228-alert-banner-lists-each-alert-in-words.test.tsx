// HA-M3-228 (D38 Milestone 3, split from HA-M3-57): "Show alerts" opens the
// list, and each wait alert says in words what is wrong and where: "No quote
// after 10 min", then the service, area, round and how long it has waited.
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn(), useAdminSocketStatus: () => 'disconnected' }));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import {
  MARKETPLACE, alert, alertsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-228: Show alerts lists each wait alert with its threshold, service, area, round and wait', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) {
      return alertsResponse([
        alert({ id: 'alert-red', kind: 'request_waiting_red', severity: 'red', thresholdMinutes: 10, currentWaitMinutes: 14 }),
        alert({
          id: 'alert-amber',
          bookingId: 'booking-2',
          kind: 'request_waiting_amber',
          severity: 'amber',
          thresholdMinutes: 5,
          currentWaitMinutes: 6,
          serviceName: 'Leak repair',
          barangay: null,
          city: 'Mandaue',
          round: 2,
        }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  const banner = await screen.findByRole('region', { name: 'Marketplace request alerts' });
  fireEvent.click(within(banner).getByRole('button', { name: 'Show alerts' }));

  const items = within(banner).getAllByTestId('marketplace-alert');
  expect(items.map((item) => item.getAttribute('data-alert-id'))).toEqual(['alert-red', 'alert-amber']);
  expect(within(items[0]!).getByText('No quote after 10 min')).toBeInTheDocument();
  expect(within(items[0]!).getByText(/Aircon cleaning · Lahug, Cebu City · Round 1 · Waiting 14 min/)).toBeInTheDocument();
  expect(within(items[1]!).getByText('No quote after 5 min')).toBeInTheDocument();
  expect(within(items[1]!).getByText(/Leak repair · Mandaue · Round 2 · Waiting 6 min/)).toBeInTheDocument();
});
