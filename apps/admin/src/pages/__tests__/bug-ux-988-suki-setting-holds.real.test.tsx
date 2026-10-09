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

function heldSukiSetting(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'suki-setting', category: 'loyalty', subcategory: null, key: 'suki_tiers',
    label: 'Suki Tiers', description: 'Tier thresholds, points, and discounts', valueType: 'json',
    value: '{}', defaultValue: '{}', minValue: null, maxValue: null, allowedValues: null,
    unit: null, isSensitive: false, isDefault: true, requiresRestart: false,
    runtimeStatus: 'held', runtimeLabel: 'Launch hold',
    runtimeSummary: 'Suki tier thresholds, earning multipliers, and discounts are held under E25 and E44 until booking calculations, customer/provider displays, and the approved loyalty policy share one versioned source.',
    editable: false, updatedAt: '2026-09-02T00:00:00.000Z', ...overrides,
  };
}

it('Bug UX-988 — Admin Settings renders unresolved Suki money controls as explained read-only holds', async () => {
  apiMocks.get.mockResolvedValueOnce({
    data: {
      data: {
        categories: [{ category: 'loyalty', count: 2 }],
        settings: {
          loyalty: [
            heldSukiSetting({}),
            heldSukiSetting({
              id: 'suki-rate', key: 'suki_points_to_peso_rate', label: 'Suki Points to Peso Rate',
              valueType: 'number', value: '100', defaultValue: '100',
              runtimeSummary: 'Suki conversion is held under E25 and E44 because the current wallet credit has a peso-to-centavo mismatch and customer redemption copy does not read the live rate.',
            }),
          ],
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

  const tierRow = (await screen.findByText('Suki Tiers')).closest('li');
  const rateRow = screen.getByText('Suki Points to Peso Rate').closest('li');
  expect(tierRow).not.toBeNull();
  expect(rateRow).not.toBeNull();
  expect(within(tierRow!).getByText('Launch hold')).toBeVisible();
  expect(within(rateRow!).getByText('Launch hold')).toBeVisible();
  expect(screen.getByText(/booking calculations, customer\/provider displays/i)).toBeVisible();
  expect(screen.getByText(/wallet credit has a peso-to-centavo mismatch/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Edit setting suki_tiers' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit setting suki_points_to_peso_rate' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reset suki_tiers to default' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reset suki_points_to_peso_rate to default' })).not.toBeInTheDocument();
});
