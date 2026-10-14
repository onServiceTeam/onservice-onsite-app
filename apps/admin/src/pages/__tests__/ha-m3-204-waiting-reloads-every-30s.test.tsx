// HA-M3-204 (D38 Milestone 3, review gap): Waiting now reloads its queue from
// the server every 30 seconds (WAITING_REFETCH_MS) on its own, so new
// requests and quotes show up even when the admin socket is down and no
// alert:new arrives. Fake timers drive only setInterval.
import React from 'react';
import { act, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

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

afterEach(() => {
  vi.useRealTimers();
});

it('HA-M3-204: Waiting now asks the server for the queue again every 30 seconds', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) return openRequestsResponse([openRequest({ bookingId: 'booking-204' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);
  expect(await screen.findByTestId('waiting-row')).toBeInTheDocument();
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
