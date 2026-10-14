// HA-M3-229 (D38 Milestone 3, split from HA-M3-58): an acknowledged alert
// stays listed until the request gets a quote or closes, muted, as "Being
// handled by <name> since <time>" (Manila time), with no Acknowledge button,
// and the banner says "All are being handled."
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

it('HA-M3-229: an acknowledged alert reads "Being handled by Maria Santos since <time>" with no Acknowledge button', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/alerts`) throw new Error(`Unexpected GET ${url}`);
    return alertsResponse([
      alert({
        id: 'alert-229',
        acknowledgedAt: '2026-10-14T02:42:00.000Z',
        acknowledgedBy: { id: 'admin-7', name: 'Maria Santos' },
      }),
    ]);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  const banner = await screen.findByRole('region', { name: 'Marketplace request alerts' });
  expect(within(banner).getByText('All are being handled.')).toBeInTheDocument();
  fireEvent.click(within(banner).getByRole('button', { name: 'Show alerts' }));

  const expectedTime = new Date('2026-10-14T02:42:00.000Z').toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit',
  });
  const item = within(banner).getByTestId('marketplace-alert');
  expect(within(item).getByText(`Being handled by Maria Santos since ${expectedTime}`)).toBeInTheDocument();
  expect(within(item).queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
});
