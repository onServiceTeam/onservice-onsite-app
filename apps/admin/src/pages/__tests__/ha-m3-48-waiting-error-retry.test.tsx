// HA-M3-48 (D38 Milestone 3): when the queue cannot be read, Waiting now says
// so (and that this is not the same as "nobody is waiting") and offers
// Retry, which asks the server again and shows the rows it returns. An
// unreadable answer (not a list) counts as a failure, never as an empty queue.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
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

it('HA-M3-48: an unreadable queue shows an honest error with Retry, and Retry loads the rows', async () => {
  let calls = 0;
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/open-requests`) throw new Error(`Unexpected GET ${url}`);
    calls += 1;
    if (calls === 1) return { data: { success: true, data: { unexpected: true }, meta: {} } };
    return openRequestsResponse([openRequest({ bookingId: 'booking-48' })]);
  });

  renderWithProviders(<WaitingNowTab />);

  expect(await screen.findByText('Waiting requests could not be loaded')).toBeInTheDocument();
  expect(
    screen.getByText(/The waiting requests response could not be read\..*not the same as "nobody is waiting"/),
  ).toBeInTheDocument();
  expect(screen.queryByText('No quote requests are open right now')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByTestId('waiting-row')).toHaveAttribute('data-booking-id', 'booking-48');
  expect(calls).toBe(2);
});
