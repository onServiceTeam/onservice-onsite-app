// HA-M3-64 (D38 Milestone 3): browsers refuse audio until the person
// interacts with the page. When the sound was left on in an earlier visit,
// the toggle asks for a click and a new alert plays nothing; after the next
// click anywhere on the page, the next alert beeps.
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
  useAdminSocketStatus: () => 'disconnected',
}));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import { ALERT_SOUND_STORAGE_KEY } from '@/lib/alert-tone';
import {
  MARKETPLACE, alert, alertsResponse, installFakeAudioContext, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

function announceAlert(id: string): void {
  act(() => {
    socket.handlers.get('alert:new')?.({ id, source: 'marketplace', kind: 'request_waiting_red', severity: 'red' });
  });
}

it('HA-M3-64: a remembered "sound on" plays nothing until the next click on the page, then beeps', async () => {
  window.localStorage.setItem(ALERT_SOUND_STORAGE_KEY, 'on');
  const audio = installFakeAudioContext();
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-64' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  expect(
    await screen.findByRole('button', { name: 'Alert sound on: click to allow it in this browser' }),
  ).toHaveAttribute('aria-pressed', 'true');
  announceAlert('alert-65');
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledTimes(2));
  expect(audio.instances).toHaveLength(0);
  expect(audio.started).toHaveLength(0);

  fireEvent.pointerDown(document.body);

  expect(await screen.findByRole('button', { name: 'Sound on' })).toBeInTheDocument();
  announceAlert('alert-66');
  await waitFor(() => expect(audio.started).toHaveLength(1));
  expect(audio.instances).toHaveLength(1);
});
