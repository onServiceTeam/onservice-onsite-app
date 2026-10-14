// HA-M3-210 (D38 Milestone 3, review gap): two admins can press Acknowledge
// on the same alert. The server answers the second with 409; the banner then
// says "Someone else already took this alert." and reloads, instead of a
// generic failure.
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

it('HA-M3-210: a 409 on Acknowledge shows "Someone else already took this alert." and reloads the alerts', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-210' })]);
    throw new Error(`Unexpected GET ${url}`);
  });
  apiMocks.post.mockImplementation(async () => {
    throw Object.assign(new Error('Alert already acknowledged'), { status: 409 });
  });

  renderWithProviders(<MarketplaceAlertBanner />);
  const banner = await screen.findByRole('region', { name: 'Marketplace request alerts' });
  fireEvent.click(within(banner).getByRole('button', { name: 'Show alerts' }));
  fireEvent.click(within(banner).getByRole('button', { name: 'Acknowledge' }));

  expect(await within(banner).findByText('Someone else already took this alert.')).toBeInTheDocument();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledTimes(2));
});
