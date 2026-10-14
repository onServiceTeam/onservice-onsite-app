// HA-M3-75 (D38 Milestone 3, review fix): the one-minute sweep announces each
// new alert with its own alert:new event, up to 50 at once, and the API allows
// 100 requests per operator per 15 minutes. A burst of five events must not
// send five alert reloads: the banner reloads once at the first event and at
// most once more when the burst window (ALERT_REFRESH_WINDOW_MS) closes.
// Real timers; the test waits out one window.
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
  useAdminSocketStatus: () => 'connected',
}));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import { ALERT_REFRESH_WINDOW_MS } from '@/components/marketplace/use-coalesced-callback';
import {
  MARKETPLACE, alert, alertsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it('HA-M3-75: a burst of five alert:new events reloads the banner alerts twice at most, not five times', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-75' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);
  expect(await screen.findByText('1 quote request alert open')).toBeInTheDocument();
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
