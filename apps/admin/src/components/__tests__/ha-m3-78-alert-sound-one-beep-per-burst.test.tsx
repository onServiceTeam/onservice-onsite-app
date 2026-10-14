// HA-M3-78 (D38 Milestone 3, review fix): the sweep can announce up to 50 new
// alerts at once, one alert:new each. With the sound on, a burst of five
// marketplace alerts plays one beep, not five stacked beeps.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

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
  useAdminSocketStatus: () => 'disconnected',
}));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import {
  MARKETPLACE, alert, alertsResponse, installFakeAudioContext, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

beforeEach(() => {
  window.localStorage.clear();
});

it('HA-M3-78: five marketplace alerts announced together play one beep', async () => {
  const audio = installFakeAudioContext();
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-78' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sound off' }));
  expect(await screen.findByRole('button', { name: 'Sound on' })).toBeInTheDocument();

  act(() => {
    for (let index = 0; index < 5; index += 1) {
      socket.handlers.get('alert:new')?.({ id: `alert-burst-${index}`, source: 'marketplace', kind: 'request_waiting_red' });
    }
  });

  expect(audio.started).toHaveLength(1);
});
