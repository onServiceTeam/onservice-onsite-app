// CR-421 (D24 Option A, 2026-10-18 review): the address search status card
// on System Settings > Dispatch & map follows the server's "available", which
// now also follows the daily limits. When all users together have reached
// today's limit it says search stopped for today (not "Working"), and when
// the limits are set to 0 it says search is off. The API is mocked; the page
// and the card render for real.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

const WORKING_STATUS = {
  keyConfigured: true,
  enabled: true,
  available: true,
  cooldownUntil: null,
  cooldownStatus: null,
  stateReadable: true,
  today: { date: '2026-10-18', autocomplete: 300, details: 120, reverse: 80, total: 500 },
  limits: { userDailyAutocomplete: 60, userDailyLookups: 30, platformDaily: 500, timeoutMs: 3000, cooldownMinutes: 10 },
  lastStatus: { status: 'OK', operation: 'autocomplete', at: '2026-10-18T09:00:00.000Z' },
};

const SWITCH_SETTING = {
  id: 'id-address_search_enabled', category: 'dispatch', subcategory: 'address_search', key: 'address_search_enabled',
  label: 'Address search (Google)', description: 'Address search (Google) description.', valueType: 'boolean',
  value: 'true', defaultValue: 'true', minValue: null, maxValue: null, allowedValues: null, unit: null,
  isSensitive: false, isDefault: true, requiresRestart: false, runtimeStatus: 'live', runtimeLabel: 'Live control',
  runtimeSummary: 'Within 60 seconds, this applies to new address searches.', editable: true,
  updatedAt: '2026-10-18T01:00:00.000Z',
};

function routeGets(status: unknown): void {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/geo/address-search/status') return { data: { success: true, data: status } };
    if (url === '/api/v1/admin/settings') {
      return { data: { data: { categories: [{ category: 'dispatch', count: 1 }], settings: { dispatch: [SWITCH_SETTING] } } } };
    }
    return { data: { data: [] } };
  });
}

async function cardText(status: unknown): Promise<HTMLElement> {
  routeGets(status);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/settings?category=dispatch']}>
        <SystemSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const card = await screen.findByRole('region', { name: 'Google address search status' });
  return within(card).findByRole('status');
}

beforeEach(() => {
  apiMocks.get.mockReset();
});

it('Bug CR-421 — the status card says search stopped for today at the daily limit, and off when the limits are 0, instead of "Working"', async () => {
  const stopped = await cardText({ ...WORKING_STATUS, available: false });
  expect(stopped).toHaveTextContent('Stopped for today: all users together reached the daily limit of Google calls.');
  expect(stopped).not.toHaveTextContent(/Working/);
  cleanup();

  const off = await cardText({
    ...WORKING_STATUS,
    available: false,
    today: { ...WORKING_STATUS.today, total: 0 },
    limits: { ...WORKING_STATUS.limits, platformDaily: 0 },
  });
  expect(off).toHaveTextContent('Off: the daily limits below are set to 0.');
  cleanup();

  const working = await cardText({ ...WORKING_STATUS, today: { ...WORKING_STATUS.today, total: 12 } });
  expect(working).toHaveTextContent('Working: customers can search addresses and turn a map pin into an address.');
});
