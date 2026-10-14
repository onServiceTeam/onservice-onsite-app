// HA-M3-79 (D38 Milestone 3, review fix): when the sound was left on in an
// earlier visit, the toggle reads "Alert sound on: click to allow it in this
// browser". Clicking that toggle, as it asks, must allow the sound and keep it
// on. The browser sends pointerdown before click; the page-wide "resume on the
// next click" listener must not run first and make the toggle's own click
// turn the sound off. The audio context follows the spec: it starts suspended
// and runs once resume() settles.
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

it('HA-M3-79: clicking the "click to allow it" toggle with a remembered "sound on" keeps the sound on', async () => {
  window.localStorage.setItem(ALERT_SOUND_STORAGE_KEY, 'on');
  installFakeAudioContext({ startsSuspended: true });
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-79' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);
  const toggle = await screen.findByRole('button', { name: 'Alert sound on: click to allow it in this browser' });

  fireEvent.pointerDown(toggle);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  fireEvent.click(screen.getByRole('button', { name: /^(Alert sound on|Sound on|Sound off|Alert sound off)/ }));

  const after = await screen.findByRole('button', { name: 'Sound on' });
  expect(after).toHaveAttribute('aria-pressed', 'true');
  expect(window.localStorage.getItem(ALERT_SOUND_STORAGE_KEY)).toBe('on');
});
