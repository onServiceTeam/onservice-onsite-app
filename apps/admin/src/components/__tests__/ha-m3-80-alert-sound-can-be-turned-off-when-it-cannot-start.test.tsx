// HA-M3-80 (D38 Milestone 3, review fix): in a browser where audio cannot
// start (resume() fails), a sound that was turned on stays "on, waiting for a
// click" for good. The admin must still be able to turn it off: "Turn sound
// off" switches it off and the choice is remembered as off.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn(), useAdminSocketStatus: () => 'disconnected' }));

import MarketplaceAlertBanner from '../MarketplaceAlertBanner';
import { ALERT_SOUND_STORAGE_KEY } from '@/lib/alert-tone';
import {
  MARKETPLACE, alert, alertsResponse, installFakeAudioContext, renderWithProviders,
} from '@/components/marketplace/__tests__/marketplace-test-fixtures';

beforeEach(() => {
  window.localStorage.clear();
});

it('HA-M3-80: when the browser cannot start audio, "Turn sound off" still turns the sound off and remembers it', async () => {
  installFakeAudioContext({ resumeFails: true });
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-80' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sound off' }));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(screen.getByRole('button', { name: 'Alert sound on: click to allow it in this browser' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Turn sound off' }));

  const toggle = await screen.findByRole('button', { name: 'Sound off' });
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(window.localStorage.getItem(ALERT_SOUND_STORAGE_KEY)).toBe('off');
});
