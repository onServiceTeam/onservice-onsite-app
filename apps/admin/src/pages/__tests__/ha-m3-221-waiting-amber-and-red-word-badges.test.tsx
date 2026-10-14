// HA-M3-221 (D38 Milestone 3, split from HA-M3-41): on Waiting now a request
// waiting for a provider's quote past the red setting (10 minutes) carries
// the words "Red: over 10 min", one past the amber setting (5 minutes) "Amber:
// over 5 min", and one under 5 minutes no badge. Colour is never the only
// signal.
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

it('HA-M3-221: provider waits past 10 and 5 minutes carry "Red: over 10 min" and "Amber: over 5 min"; under 5 minutes no badge', async () => {
  const now = Date.now();
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) {
      return openRequestsResponse([
        openRequest({ bookingId: 'providers-12', waitingSince: minutesAgo(12.3, now), waitMinutes: 12 }),
        openRequest({ bookingId: 'providers-7', waitingSince: minutesAgo(7.3, now), waitMinutes: 7 }),
        openRequest({ bookingId: 'providers-3', waitingSince: minutesAgo(3.3, now), waitMinutes: 3 }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);

  // The first render can be slow while the whole suite runs in parallel.
  await screen.findByText('Waiting 12 min', {}, { timeout: 5_000 });
  const [red, amber, quiet] = screen.getAllByTestId('waiting-row');
  expect(within(red!).getByText('Red: over 10 min')).toBeInTheDocument();
  expect(red).toHaveAttribute('data-severity', 'red');
  expect(within(amber!).getByText('Amber: over 5 min')).toBeInTheDocument();
  expect(amber).toHaveAttribute('data-severity', 'amber');
  expect(within(quiet!).queryByText(/over \d+ min/)).not.toBeInTheDocument();
  expect(quiet).toHaveAttribute('data-severity', 'none');
});
