// HA-M3-62 (D38 Milestone 3): the alert sound is off by default. With
// nothing remembered in this browser the banner's toggle reads "Sound off",
// and a new marketplace alert (alert:new) plays nothing: no audio context is
// even created.
import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
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

it('HA-M3-62: the alert sound is off by default and a new alert plays nothing', async () => {
  const audio = installFakeAudioContext();
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-62' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  const toggle = await screen.findByRole('button', { name: 'Sound off' });
  expect(toggle).toHaveAttribute('aria-pressed', 'false');

  act(() => {
    socket.handlers.get('alert:new')?.({ id: 'alert-63', source: 'marketplace', kind: 'request_waiting_red', severity: 'red' });
  });
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledTimes(2));

  expect(audio.instances).toHaveLength(0);
  expect(audio.started).toHaveLength(0);
});
