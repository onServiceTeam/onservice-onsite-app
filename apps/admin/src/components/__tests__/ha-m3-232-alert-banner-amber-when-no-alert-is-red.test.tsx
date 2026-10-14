// HA-M3-232 (D38 Milestone 3, the other half of HA-M3-227): while no open
// alert is red (meta.openRedCount is 0), the banner stays amber.
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

it('HA-M3-232: with only amber alerts open the banner is amber', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) {
      return alertsResponse([
        alert({ id: 'alert-amber-1', kind: 'request_waiting_amber', severity: 'amber', thresholdMinutes: 5 }),
        alert({ id: 'alert-amber-2', bookingId: 'booking-2', kind: 'request_waiting_amber', severity: 'amber', thresholdMinutes: 5 }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  expect(await screen.findByRole('region', { name: 'Marketplace request alerts' })).toHaveAttribute('data-severity', 'amber');
});
