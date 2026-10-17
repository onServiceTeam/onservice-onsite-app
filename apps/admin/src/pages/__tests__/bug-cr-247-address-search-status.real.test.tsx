// CR-247 and CR-248 (D24 Option A, 2026-10-18): System Settings > Dispatch &
// map shows a read-only Google address search status card (key set yes/no,
// switch, pause end time in Manila time, today's call counts, Google's last
// status word) above the six address search controls, which render as live,
// editable settings. Saving one refreshes the card. The API is mocked; the
// page and the card render for real.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function setting(key: string, label: string, valueType: string, value: string, unit: string | null, min: number | null, max: number | null) {
  return {
    id: `id-${key}`, category: 'dispatch', subcategory: 'address_search', key, label,
    description: `${label} description.`, valueType, value, defaultValue: value,
    minValue: min, maxValue: max, allowedValues: null, unit,
    isSensitive: false, isDefault: true, requiresRestart: false,
    runtimeStatus: 'live', runtimeLabel: 'Live control',
    runtimeSummary: 'Within 60 seconds, this applies to new address searches.',
    editable: true, updatedAt: '2026-10-18T01:00:00.000Z',
  };
}

const ADDRESS_SETTINGS = [
  setting('address_search_enabled', 'Address search (Google)', 'boolean', 'true', null, null, null),
  setting('address_search_user_daily_autocomplete_limit', 'Address suggestions per user per day', 'integer', '60', 'searches', 0, 1000),
  setting('address_search_user_daily_lookup_limit', 'Address lookups per user per day', 'integer', '30', 'lookups', 0, 500),
  setting('address_search_platform_daily_limit', 'Google address calls per day (all users)', 'integer', '500', 'calls', 0, 100000),
  setting('address_search_timeout_ms', 'Address search time limit', 'integer', '3000', 'milliseconds', 1000, 10000),
  setting('address_search_cooldown_minutes', 'Address search pause after a Google refusal', 'integer', '10', 'minutes', 1, 1440),
];

const PAUSED_STATUS = {
  keyConfigured: true,
  enabled: true,
  available: false,
  cooldownUntil: '2026-10-18T02:42:00.000Z', // 10:42 AM Manila
  cooldownStatus: 'REQUEST_DENIED',
  stateReadable: true,
  today: { date: '2026-10-18', autocomplete: 7, details: 2, reverse: 1, total: 10 },
  limits: { userDailyAutocomplete: 60, userDailyLookups: 30, platformDaily: 500, timeoutMs: 3000, cooldownMinutes: 10 },
  lastStatus: { status: 'REQUEST_DENIED', operation: 'reverse', at: '2026-10-18T02:32:00.000Z' },
};

function routeGets(status: unknown): void {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/geo/address-search/status') return { data: { success: true, data: status } };
    if (url === '/api/v1/admin/settings') {
      return {
        data: {
          data: {
            categories: [{ category: 'dispatch', count: ADDRESS_SETTINGS.length }],
            settings: { dispatch: ADDRESS_SETTINGS },
          },
        },
      };
    }
    return { data: { data: [] } };
  });
}

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/settings?category=dispatch']}>
        <SystemSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  apiMocks.get.mockReset();
  apiMocks.put.mockReset();
  apiMocks.post.mockReset();
});

it('Bug CR-247 — the Dispatch settings show the address search status: key set, paused until a Manila time with Google\'s word, and today\'s counts', async () => {
  routeGets(PAUSED_STATUS);
  renderPage();

  const card = await screen.findByRole('region', { name: 'Google address search status' });
  await within(card).findByText(/Paused until Oct 18, 2026, 10:42/);
  expect(within(card).getByText(/Google answered REQUEST_DENIED/)).toBeInTheDocument();
  expect(within(card).getByText('Set')).toBeInTheDocument();
  expect(within(card).getByText('On')).toBeInTheDocument();
  expect(within(card).getByText('10 of 500')).toBeInTheDocument();
  expect(within(card).getByText(/Suggestions 7 · Chosen addresses 2 · Pin lookups 1/)).toBeInTheDocument();
  expect(within(card).getByText(/pin lookup, Oct 18, 2026, 10:32/)).toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/geo/address-search/status');
});

it('Bug CR-248 — the six address search controls render as editable live settings, a missing key reads "Not set", and a save refreshes the status card', async () => {
  routeGets({ ...PAUSED_STATUS, keyConfigured: false, cooldownUntil: null, cooldownStatus: null, lastStatus: null });
  apiMocks.put.mockResolvedValue({ data: { data: { ...ADDRESS_SETTINGS[3], value: '300' } } });
  const client = renderPage();
  const invalidate = vi.spyOn(client, 'invalidateQueries');

  const card = await screen.findByRole('region', { name: 'Google address search status' });
  await within(card).findByText(/Off: the server has no Google key yet/);
  expect(within(card).getByText('Not set')).toBeInTheDocument();
  expect(within(card).getByText('None yet')).toBeInTheDocument();
  for (const item of ADDRESS_SETTINGS) {
    expect(screen.getByRole('button', { name: `Edit setting ${item.key}` })).toBeInTheDocument();
  }

  fireEvent.click(screen.getByRole('button', { name: 'Edit setting address_search_platform_daily_limit' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Value for address_search_platform_daily_limit' }), {
    target: { value: '300' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Audit reason for address_search_platform_daily_limit' }), {
    target: { value: 'Lower the daily Google bill guard for the pilot.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));

  await waitFor(() => {
    expect(apiMocks.put).toHaveBeenCalledWith('/api/v1/admin/settings/address_search_platform_daily_limit', {
      value: '300', reason: 'Lower the daily Google bill guard for the pilot.', expectedUpdatedAt: '2026-10-18T01:00:00.000Z',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'address-search-status'] });
  });
});
