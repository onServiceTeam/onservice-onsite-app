// HA-M3-73 (D38 Milestone 3): the banner is on every admin page and the
// API's global limit is 100 requests per operator per 15 minutes by default,
// so while the admin socket is connected (new alerts arrive through
// alert:new) the banner reloads the alerts every 60 seconds instead of every
// 30. Fake timers drive only setInterval.
import React from 'react';
import { act, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn(), useAdminSocketStatus: () => 'connected' }));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import {
  MARKETPLACE, alert, alertsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

afterEach(() => {
  vi.useRealTimers();
});

it('HA-M3-73: with the admin socket connected the banner reloads alerts every 60 seconds, not every 30', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-73' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);
  expect(await screen.findByText('1 quote request alert open')).toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledTimes(1);

  await act(async () => {
    vi.advanceTimersByTime(30_000);
  });
  expect(apiMocks.get).toHaveBeenCalledTimes(1);

  await act(async () => {
    vi.advanceTimersByTime(30_000);
  });
  expect(apiMocks.get).toHaveBeenCalledTimes(2);
});
