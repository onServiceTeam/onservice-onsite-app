// HA-M3-203 (D38 Milestone 3, review gap): while the admin socket is down,
// alert:new never arrives, so the banner's timer is the only way a new amber
// or red alert reaches the operator. With the socket disconnected the banner
// reloads the open alerts after 30 seconds (ALERT_REFETCH_MS). Fake timers
// drive only setInterval.
import React from 'react';
import { act, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn(), useAdminSocketStatus: () => 'disconnected' }));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import {
  MARKETPLACE, alert, alertsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

afterEach(() => {
  vi.useRealTimers();
});

it('HA-M3-203: with the admin socket disconnected the banner reloads the open alerts every 30 seconds', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-203' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);
  expect(await screen.findByText('1 quote request alert open')).toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledTimes(1);

  await act(async () => {
    vi.advanceTimersByTime(29_000);
  });
  expect(apiMocks.get).toHaveBeenCalledTimes(1);

  await act(async () => {
    vi.advanceTimersByTime(1_000);
  });
  expect(apiMocks.get).toHaveBeenCalledTimes(2);
});
