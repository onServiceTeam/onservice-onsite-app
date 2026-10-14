// HA-M3-74 (D38 Milestone 3, review fix): a failed alert check is reported
// even after an earlier check succeeded with no open alert. The first check
// says "no alerts" (the banner is empty); then a new alert is announced and
// the next check fails (for example "Too many requests"). The banner must say
// "Request alerts could not be checked" instead of staying empty, because an
// empty banner reads as "no customer is waiting".
import React from 'react';
import { act, screen } from '@testing-library/react';
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
import { marketplaceKeys } from '@/components/marketplace/marketplace-api';
import { MARKETPLACE, alertsResponse, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-74: after a check that found no alerts, a later failed check shows "Request alerts could not be checked"', async () => {
  let calls = 0;
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/alerts`) throw new Error(`Unexpected GET ${url}`);
    calls += 1;
    if (calls === 1) return alertsResponse([]);
    throw new Error('Too many requests');
  });

  const { container, client } = renderWithProviders(<MarketplaceAlertBanner />);
  await vi.waitFor(() => expect(client.getQueryState(marketplaceKeys.alerts)?.status).toBe('success'));
  expect(container).toBeEmptyDOMElement();

  act(() => {
    socket.handlers.get('alert:new')?.({ id: 'alert-74', source: 'marketplace', kind: 'request_waiting_red', severity: 'red' });
  });

  expect(await screen.findByText('Request alerts could not be checked. Retrying automatically.')).toBeInTheDocument();
  expect(calls).toBe(2);
});
