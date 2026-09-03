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

it('Bug UX-990 — Admin Settings explains and removes edits for the unresolved no-show refund control', async () => {
  apiMocks.get.mockResolvedValueOnce({
    data: {
      data: {
        categories: [{ category: 'disputes', count: 1 }],
        settings: {
          disputes: [{
            id: 'no-show-window', category: 'disputes', subcategory: 'no_show',
            key: 'noshow_auto_resolve_window_minutes', label: 'No-Show Auto-Resolve Window',
            description: 'Maximum scheduled-to-completed interval used by the no-show auto-resolution rule.',
            valueType: 'integer', value: '30', defaultValue: '30', minValue: 1, maxValue: 1440,
            allowedValues: null, unit: 'minutes', isSensitive: false, isDefault: true,
            requiresRestart: false, runtimeStatus: 'held', runtimeLabel: 'Launch hold',
            runtimeSummary: 'This threshold can trigger an automatic full refund from completion timing alone. Editing is held under E59 until the evidence rule and E18 escrow timing are resolved without widening unsafe settlements.',
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

  const row = (await screen.findByText('No-Show Auto-Resolve Window')).closest('li');
  expect(row).not.toBeNull();
  expect(within(row!).getByText('Launch hold')).toBeVisible();
  expect(within(row!).getByText(/automatic full refund from completion timing alone/i)).toBeVisible();
  expect(within(row!).queryByRole('button', { name: 'Edit setting noshow_auto_resolve_window_minutes' })).not.toBeInTheDocument();
  expect(within(row!).queryByRole('button', { name: 'Reset noshow_auto_resolve_window_minutes to default' })).not.toBeInTheDocument();
});
