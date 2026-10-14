// HA-M3-57 (D38 Milestone 3): with open alerts the banner says how many are
// open (meta.openCount) and links to Marketplace, Waiting now. (The unhandled
// count, the red tone and the alert list have their own tests, HA-M3-226,
// HA-M3-227 and HA-M3-228.)
import React from 'react';
import { screen, within } from '@testing-library/react';
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

it('HA-M3-57: the banner shows how many quote request alerts are open, with a link to Waiting now', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) {
      return alertsResponse([
        alert({ id: 'alert-red', kind: 'request_waiting_red', severity: 'red' }),
        alert({ id: 'alert-amber', bookingId: 'booking-2', kind: 'request_waiting_amber', severity: 'amber', thresholdMinutes: 5 }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  const banner = await screen.findByRole('region', { name: 'Marketplace request alerts' });
  expect(within(banner).getByText('2 quote request alerts open')).toBeInTheDocument();
  expect(within(banner).getByRole('link', { name: 'Open Marketplace' })).toHaveAttribute('href', '/marketplace?tab=waiting');
});
