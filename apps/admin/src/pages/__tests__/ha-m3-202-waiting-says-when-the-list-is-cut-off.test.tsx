// HA-M3-202 (D38 Milestone 3, review fix): Waiting now asks for the first 100
// open requests (provider waits first, longest first). When the server sends
// a full 100, the list is cut off: the tab must say so and give the real
// totals from GET /api/v1/admin/marketplace-health/summary (120 waiting for a
// provider and 10 waiting for the customer here), instead of a heading that
// reads as if 100 were the whole queue.
import React from 'react';
import { screen } from '@testing-library/react';
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

it('HA-M3-202: a full page of 100 waiting requests says the list is cut off and gives the real totals', async () => {
  const now = Date.now();
  const rows = Array.from({ length: 100 }, (_, index) => openRequest({
    bookingId: `booking-${String(index).padStart(3, '0')}`,
    waitingSince: minutesAgo(200 - index, now),
    waitMinutes: 200 - index,
    severity: 'red',
  }));
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) return openRequestsResponse(rows);
    if (url === `${MARKETPLACE}/summary`) {
      return { data: { success: true, data: {
        waitingCount: 120, waitingOverAmber: 118, waitingOverRed: 110, awaitingCustomer: 10,
        openAlerts: 40, unacknowledgedAlerts: 30, amberMinutes: 5, redMinutes: 10,
      } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);

  // A hundred rows take a while to render when the whole suite runs at once.
  expect(await screen.findByText(
    'Only the first 100 open requests are listed, longest wait for a provider first. 130 are open: 120 waiting for a provider\'s quote and 10 waiting for the customer.',
    {},
    { timeout: 10_000 },
  )).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Waiting for a provider\'s quote (100 of 120)' })).toBeInTheDocument();
}, 20_000);
