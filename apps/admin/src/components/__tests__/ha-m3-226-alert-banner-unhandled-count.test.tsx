// HA-M3-226 (D38 Milestone 3, split from HA-M3-57): the banner says how many
// open alerts nobody has acknowledged yet (meta.unacknowledgedCount): "1 not
// yet being handled." here, with one alert already taken by another admin.
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

it('HA-M3-226: the banner says how many open alerts are not yet being handled', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) {
      return alertsResponse([
        alert({ id: 'alert-open' }),
        alert({
          id: 'alert-taken',
          bookingId: 'booking-2',
          acknowledgedAt: '2026-10-14T02:20:00.000Z',
          acknowledgedBy: { id: 'admin-2', name: 'Maria Santos' },
        }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  const banner = await screen.findByRole('region', { name: 'Marketplace request alerts' });
  expect(within(banner).getByText('2 quote request alerts open')).toBeInTheDocument();
  expect(within(banner).getByText('1 not yet being handled.')).toBeInTheDocument();
});
