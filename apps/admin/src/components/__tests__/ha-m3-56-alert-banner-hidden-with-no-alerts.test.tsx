// HA-M3-56 (D38 Milestone 3): the marketplace alert banner under the admin
// header renders nothing when the server reports no open alert, so it never
// takes space on a quiet day. Source: GET
// /api/v1/admin/marketplace-health/alerts?status=open.
import React from 'react';
import { waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn(), useAdminSocketStatus: () => 'disconnected' }));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import { marketplaceKeys } from '@/components/marketplace/marketplace-api';
import { MARKETPLACE, alertsResponse, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-56: the alert banner renders nothing once the server says there are no open alerts', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([]);
    throw new Error(`Unexpected GET ${url}`);
  });

  const { container, client } = renderWithProviders(<MarketplaceAlertBanner />);

  await waitFor(() => expect(client.getQueryState(marketplaceKeys.alerts)?.status).toBe('success'));
  expect(apiMocks.get).toHaveBeenCalledWith(`${MARKETPLACE}/alerts`, { params: { status: 'open', limit: 50 } });
  expect(container).toBeEmptyDOMElement();
});
