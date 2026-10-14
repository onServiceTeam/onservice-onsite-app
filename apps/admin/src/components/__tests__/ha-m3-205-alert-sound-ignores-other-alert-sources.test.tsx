// HA-M3-205 (D38 Milestone 3, review gap): the beep is for marketplace
// request alerts only. With the sound on and allowed, an alert:new whose
// source is not 'marketplace' plays nothing.
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

it('HA-M3-205: with the sound on, an alert:new from another source plays no beep', async () => {
  const audio = installFakeAudioContext();
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/alerts`) return alertsResponse([alert({ id: 'alert-205' })]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplaceAlertBanner />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sound off' }));
  expect(await screen.findByRole('button', { name: 'Sound on' })).toBeInTheDocument();

  act(() => {
    socket.handlers.get('alert:new')?.({ id: 'system-1', source: 'reconciliation', severity: 'error' });
  });

  expect(audio.instances).toHaveLength(1);
  expect(audio.started).toHaveLength(0);
});
