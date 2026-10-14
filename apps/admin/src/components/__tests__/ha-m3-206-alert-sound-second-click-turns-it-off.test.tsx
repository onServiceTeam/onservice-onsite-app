// HA-M3-206 (D38 Milestone 3, review gap): the sound toggle also turns the
// sound off. After it was turned on and allowed, the next click turns it off,
// remembers "off" in this browser, and a new marketplace alert plays nothing.
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
import { ALERT_SOUND_STORAGE_KEY } from '@/lib/alert-tone';
import {
  MARKETPLACE, alert, alertsResponse, installFakeAudioContext, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

beforeEach(() => {
  window.localStorage.clear();
});

it('HA-M3-206: a second click on the sound toggle turns the sound off and remembers "off"', async () => {
  const audio = installFakeAudioContext();
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-206' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sound off' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sound on' }));

  const toggle = await screen.findByRole('button', { name: 'Sound off' });
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(window.localStorage.getItem(ALERT_SOUND_STORAGE_KEY)).toBe('off');
  act(() => {
    socket.handlers.get('alert:new')?.({ id: 'alert-206-new', source: 'marketplace', kind: 'request_waiting_red' });
  });
  expect(audio.started).toHaveLength(0);
});
