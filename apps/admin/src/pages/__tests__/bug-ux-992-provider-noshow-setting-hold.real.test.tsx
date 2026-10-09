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

it('Bug UX-992 — Admin Settings explains and removes edits for the unresolved customer no-show wait', async () => {
  apiMocks.get.mockResolvedValueOnce({
    data: {
      data: {
        categories: [{ category: 'provider', count: 1 }],
        settings: {
          provider: [{
            id: 'provider-no-show', category: 'provider', subcategory: null,
            key: 'provider_noshow_minutes', label: 'No-Show Timeout',
            description: 'Minutes after scheduled time before no-show.',
            valueType: 'integer', value: '30', defaultValue: '30', minValue: 10, maxValue: 120,
            allowedValues: null, unit: 'minutes', isSensitive: false, isDefault: true,
            requiresRestart: false, runtimeStatus: 'held', runtimeLabel: 'Launch hold',
            runtimeSummary: 'One value currently controls both provider-late alerts and a customer no-show money decision. Editing is held under E60 until the wait is measured from verified arrival and snapshotted prospectively for each booking.',
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

  const row = (await screen.findByText('No-Show Timeout')).closest('li');
  expect(row).not.toBeNull();
  expect(within(row!).getByText('Launch hold')).toBeVisible();
  expect(within(row!).getByText(/provider-late alerts and a customer no-show money decision/i)).toBeVisible();
  expect(within(row!).queryByRole('button', { name: 'Edit setting provider_noshow_minutes' })).not.toBeInTheDocument();
  expect(within(row!).queryByRole('button', { name: 'Reset provider_noshow_minutes to default' })).not.toBeInTheDocument();
});
