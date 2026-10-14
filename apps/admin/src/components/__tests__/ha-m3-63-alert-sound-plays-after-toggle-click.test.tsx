// HA-M3-63 (D38 Milestone 3): after the admin clicks the sound toggle (the
// click that lets the browser play audio), a new marketplace alert on the
// admin socket plays one short beep, and the choice is remembered in this
// browser.
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
import { ALERT_SOUND_STORAGE_KEY } from '@/lib/alert-tone';
import {
  MARKETPLACE, alert, alertsResponse, installFakeAudioContext, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

beforeEach(() => {
  window.localStorage.clear();
});

it('HA-M3-63: once the sound toggle is clicked, a new marketplace alert plays a beep', async () => {
  const audio = installFakeAudioContext();
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-63' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);

  fireEvent.click(await screen.findByRole('button', { name: 'Sound off' }));
  const toggle = await screen.findByRole('button', { name: 'Sound on' });
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(audio.instances).toHaveLength(1);
  expect(window.localStorage.getItem(ALERT_SOUND_STORAGE_KEY)).toBe('on');
  expect(audio.started).toHaveLength(0);

  act(() => {
    socket.handlers.get('alert:new')?.({ id: 'alert-64', source: 'marketplace', kind: 'request_waiting_amber', severity: 'amber' });
  });

  await waitFor(() => expect(audio.started).toHaveLength(1));
});
