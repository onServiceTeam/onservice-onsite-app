// HA-M3-76 (D38 Milestone 3, review fix): a burst of alert:new events (the
// sweep sends one per new alert, up to 50) makes Waiting now reload its queue
// once at the first event and at most once more when the burst window closes,
// instead of once per event. Real timers; the test waits out one window.
import React from 'react';
import { act, screen } from '@testing-library/react';
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
import { ALERT_REFRESH_WINDOW_MS } from '@/components/marketplace/use-coalesced-callback';
import {
  MARKETPLACE, openRequest, openRequestsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it('HA-M3-76: a burst of five alert:new events reloads Waiting now twice at most, not five times', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) return openRequestsResponse([openRequest({ bookingId: 'booking-76' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);
  expect(await screen.findByTestId('waiting-row')).toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledTimes(1);

  act(() => {
    for (let index = 0; index < 5; index += 1) {
      socket.handlers.get('alert:new')?.({ id: `alert-burst-${index}`, source: 'marketplace', kind: 'request_waiting_amber' });
    }
  });
  await act(async () => {
    await sleep(ALERT_REFRESH_WINDOW_MS / 3);
  });
  expect(apiMocks.get).toHaveBeenCalledTimes(2);

  await act(async () => {
    await sleep(ALERT_REFRESH_WINDOW_MS + 500);
  });
  expect(apiMocks.get).toHaveBeenCalledTimes(3);
}, 15_000);
