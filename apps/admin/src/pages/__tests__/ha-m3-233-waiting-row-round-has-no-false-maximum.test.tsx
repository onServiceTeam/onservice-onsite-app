// HA-M3-233 (D38 Milestone 3, integrated review 2026-10-14): the Waiting now
// row shows only the round number. request_max_rounds counts rounds the
// customer fully declined before back-office review; it is not a cap on
// rounds (a lapsed or withdrawn quote also opens a new round, and the review
// flag itself opens one). So a request flagged after 3 declined rounds, now in
// round 4, must not read "Round 4 of 3".
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
import { MARKETPLACE, openRequest, openRequestsResponse, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-233: a request in round 4 with request_max_rounds 3 reads "Round 4", never "Round 4 of 3"', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) {
      return openRequestsResponse([openRequest({ bookingId: 'booking-233', round: 4, maxRounds: 3 })]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);

  const row = await screen.findByTestId('waiting-row');
  expect(within(row).getByText('Round 4')).toBeInTheDocument();
  expect(row.textContent).not.toMatch(/Round 4 of 3/);
});
