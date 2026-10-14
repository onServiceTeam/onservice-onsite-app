// HA-M3-222 (D38 Milestone 3, split from HA-M3-41): a request whose quote is
// waiting for the customer's decision is listed under "Quote sent, waiting
// for the customer" with "Round open 30 min" and no amber or red badge, even
// past the red setting: a provider has answered, so it raises no alert.
import React from 'react';
import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import { WaitingNowTab } from '@/components/marketplace/WaitingNowTab';
import {
  MARKETPLACE, minutesAgo, openRequest, openRequestsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-222: a request waiting on the customer shows "Round open 30 min" with no badge', async () => {
  const now = Date.now();
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) {
      return openRequestsResponse([
        openRequest({ bookingId: 'customer-30', waitingOn: 'customer', liveQuotes: 1, waitingSince: minutesAgo(30.3, now), waitMinutes: 30 }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);

  const section = await screen.findByRole('region', { name: 'Quote sent, waiting for the customer (1)' }, { timeout: 5_000 });
  const row = within(section).getByTestId('waiting-row');
  expect(within(row).getByText('Round open 30 min')).toBeInTheDocument();
  expect(within(row).queryByText(/over \d+ min/)).not.toBeInTheDocument();
  expect(row).toHaveAttribute('data-severity', 'none');
});
