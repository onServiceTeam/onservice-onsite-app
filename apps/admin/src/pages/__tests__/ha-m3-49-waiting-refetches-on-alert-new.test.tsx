// HA-M3-49 (D38 Milestone 3): when the server announces a new alert on the
// admin socket (alert:new, emitted by the one-minute sweep), Waiting now asks
// for the queue again at once instead of waiting for its 30-second reload.
import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const socket = vi.hoisted(() => ({ handlers: new Map<string, (payload: unknown) => void>() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({
  useAdminSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    socket.handlers.set(event, handler);
  },
}));

import { WaitingNowTab } from '@/components/marketplace/WaitingNowTab';
import {
  MARKETPLACE, openRequest, openRequestsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-49: an alert:new socket event makes Waiting now reload the queue straight away', async () => {
  let calls = 0;
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/open-requests`) throw new Error(`Unexpected GET ${url}`);
    calls += 1;
    return openRequestsResponse(calls === 1 ? [] : [openRequest({ bookingId: 'booking-49' })]);
  });

  renderWithProviders(<WaitingNowTab />);
  expect(await screen.findByText('No quote requests are open right now')).toBeInTheDocument();

  act(() => {
    socket.handlers.get('alert:new')?.({ id: 'alert-1', source: 'marketplace', kind: 'request_waiting_amber' });
  });

  expect(await screen.findByTestId('waiting-row')).toHaveAttribute('data-booking-id', 'booking-49');
  await waitFor(() => expect(calls).toBe(2));
});
