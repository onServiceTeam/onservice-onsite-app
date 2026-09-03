import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: () => 'Request failed',
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

it('Bug UX-997 — Admin Settings explains and removes edits for inconsistent NBI expiry enforcement', async () => {
  apiMocks.get.mockResolvedValueOnce({
    data: {
      data: {
        categories: [{ category: 'provider', count: 1 }],
        settings: {
          provider: [{
            id: 'nbi-warning', category: 'provider', subcategory: null,
            key: 'nbi_expiry_warning_days', label: 'NBI Expiry Warning',
            description: 'Days before NBI expiry to send a warning.',
            valueType: 'integer', value: '30', defaultValue: '30', minValue: 7, maxValue: 90,
            allowedValues: null, unit: 'days', isSensitive: false, isDefault: true,
            requiresRestart: false, runtimeStatus: 'held', runtimeLabel: 'Launch hold',
            runtimeSummary: 'The NBI worker uses one notified flag for both warning and expiry, so warned providers can be skipped at expiry while other providers are auto-suspended contrary to the manual policy. Editing is held under E62.',
            editable: false, updatedAt: '2026-09-02T00:00:00.000Z',
          }],
        },
      },
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SystemSettingsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const row = (await screen.findByText('NBI Expiry Warning')).closest('li');
  expect(row).not.toBeNull();
  expect(within(row!).getByText('Launch hold')).toBeVisible();
  expect(within(row!).getByText(/warned providers can be skipped at expiry/i)).toBeVisible();
  expect(within(row!).queryByRole('button', { name: 'Edit setting nbi_expiry_warning_days' })).not.toBeInTheDocument();
  expect(within(row!).queryByRole('button', { name: 'Reset nbi_expiry_warning_days to default' })).not.toBeInTheDocument();
});
