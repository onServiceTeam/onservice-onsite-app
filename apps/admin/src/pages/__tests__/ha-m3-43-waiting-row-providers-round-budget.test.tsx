// HA-M3-43 (D38 Milestone 3): a Waiting now row tells the back office what
// happened in the current round (providers notified, opened, quoted), the
// totals over every round once the request has reopened, the round number
// (not "of" request_max_rounds, which is not a cap: integrated review
// 2026-10-14, see HA-M3-233), and the customer's budget range in pesos (sent
// in centavos).
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
  MARKETPLACE, openRequest, openRequestsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it("HA-M3-43: a waiting row shows this round's notified, opened and quoted counts, all-round totals, the round number and the budget", async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) {
      return openRequestsResponse([
        openRequest({
          bookingId: 'booking-43',
          round: 2,
          maxRounds: 3,
          notified: 5,
          viewed: 2,
          responded: 0,
          notifiedTotal: 9,
          viewedTotal: 4,
          respondedTotal: 1,
          declinedQuotes: 1,
          budgetMinCentavos: 150_000,
          budgetMaxCentavos: 250_000,
        }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);

  const row = await screen.findByTestId('waiting-row');
  expect(within(row).getByText('Notified 5 · Opened 2 · Quoted 0')).toBeInTheDocument();
  expect(within(row).getByText('All rounds: notified 9 · opened 4 · quoted 1')).toBeInTheDocument();
  expect(within(row).getByText('Round 2')).toBeInTheDocument();
  expect(within(row).getByText('Customer declined 1 quote')).toBeInTheDocument();
  expect(within(row).getByText(/^₱1,500\.00 to ₱2,500\.00$/)).toBeInTheDocument();
  expect(within(row).getByText('Aircon cleaning')).toBeInTheDocument();
  expect(within(row).getByText('Lahug, Cebu City · Ana R.')).toBeInTheDocument();
});
