// HA-M3-58 (D38 Milestone 3): Acknowledge in the banner posts
// /api/v1/admin/marketplace-health/alerts/:id/acknowledge (the server writes
// the marketplace_alert_acknowledged audit row) and then reloads the alerts.
// (What the acknowledged alert looks like afterwards is HA-M3-229.)
import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

it('HA-M3-58: Acknowledge posts to the alert\'s acknowledge endpoint and reloads the alerts', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/alerts`) throw new Error(`Unexpected GET ${url}`);
    return alertsResponse([alert({ id: 'alert-58' })]);
  });
  apiMocks.post.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/alerts/alert-58/acknowledge`) throw new Error(`Unexpected POST ${url}`);
    return { data: { success: true, data: alert({ id: 'alert-58', acknowledgedAt: '2026-10-14T02:42:00.000Z' }) } };
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  const banner = await screen.findByRole('region', { name: 'Marketplace request alerts' });
  fireEvent.click(within(banner).getByRole('button', { name: 'Show alerts' }));
  fireEvent.click(within(banner).getByRole('button', { name: 'Acknowledge' }));

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(`${MARKETPLACE}/alerts/alert-58/acknowledge`, {}));
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledTimes(2));
  expect(apiMocks.post).toHaveBeenCalledTimes(1);
});
