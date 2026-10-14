// HA-M3-42 (D38 Milestone 3): the wait on Waiting now keeps counting without
// a reload. A request first loaded at 4 min 55 s shows no badge; after the
// next 15-second tick the on-screen wait is past 5 minutes and the row says
// "Waiting 5 min" with the amber badge, although the server was not asked
// again (the list itself reloads only every 30 seconds). Fake timers drive
// only setInterval and the clock.
import React from 'react';
import { act, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import { WAIT_TICK_MS, WaitingNowTab } from '@/components/marketplace/WaitingNowTab';
import {
  MARKETPLACE, openRequest, openRequestsResponse, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

afterEach(() => {
  vi.useRealTimers();
});

it('HA-M3-42: a waiting row turns amber on screen when its wait passes 5 minutes, with no reload', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-14T02:00:00.000Z'));
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) {
      return openRequestsResponse([
        openRequest({ bookingId: 'booking-1', waitingSince: '2026-10-14T01:55:05.000Z', waitMinutes: 4 }),
      ], { generatedAt: new Date().toISOString() });
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);

  const row = await screen.findByTestId('waiting-row');
  expect(within(row).getByText('Waiting 4 min')).toBeInTheDocument();
  expect(row).toHaveAttribute('data-severity', 'none');

  act(() => {
    vi.advanceTimersByTime(WAIT_TICK_MS);
  });
  expect(within(row).getByText('Waiting 5 min')).toBeInTheDocument();
  expect(within(row).getByText('Amber: over 5 min')).toBeInTheDocument();
  expect(row).toHaveAttribute('data-severity', 'amber');
  expect(apiMocks.get).toHaveBeenCalledTimes(1);
});
