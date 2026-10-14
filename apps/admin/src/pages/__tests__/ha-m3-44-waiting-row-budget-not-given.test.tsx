// HA-M3-44 (D38 Milestone 3): when the customer chose "Not sure" for the
// budget (bookings.budget_unknown) the Waiting now row says "Budget not
// given" instead of a peso amount or a blank.
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

it('HA-M3-44: a waiting row says "Budget not given" when the customer did not give a budget', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) {
      return openRequestsResponse([
        openRequest({ bookingId: 'booking-44', budgetUnknown: true, budgetMinCentavos: null, budgetMaxCentavos: null }),
      ]);
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);

  const row = await screen.findByTestId('waiting-row');
  expect(within(row).getByText('Budget not given')).toBeInTheDocument();
  expect(within(row).queryByText(/₱/)).not.toBeInTheDocument();
});
