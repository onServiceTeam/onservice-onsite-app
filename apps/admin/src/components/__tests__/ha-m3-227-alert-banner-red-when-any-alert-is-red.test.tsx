// HA-M3-227 (D38 Milestone 3, split from HA-M3-57): the banner is red as soon
// as one open alert is red (meta.openRedCount above 0), even when the others
// are amber.
import React from 'react';
import { screen } from '@testing-library/react';
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

it('HA-M3-227: one red alert among amber ones makes the banner red', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) {
      return alertsResponse([
        alert({ id: 'alert-amber-1', kind: 'request_waiting_amber', severity: 'amber', thresholdMinutes: 5 }),
        alert({ id: 'alert-red', bookingId: 'booking-2', kind: 'request_waiting_red', severity: 'red' }),
        alert({ id: 'alert-amber-2', bookingId: 'booking-3', kind: 'request_waiting_amber', severity: 'amber', thresholdMinutes: 5 }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  expect(await screen.findByRole('region', { name: 'Marketplace request alerts' })).toHaveAttribute('data-severity', 'red');
});
