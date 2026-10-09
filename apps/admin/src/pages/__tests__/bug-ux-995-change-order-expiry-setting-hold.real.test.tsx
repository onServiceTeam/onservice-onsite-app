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

it('Bug UX-995 — Admin Settings explains and removes edits for retroactive change-order expiry', async () => {
  apiMocks.get.mockResolvedValueOnce({
    data: {
      data: {
        categories: [{ category: 'provider', count: 1 }],
        settings: {
          provider: [{
            id: 'change-order-expiry', category: 'provider', subcategory: null,
            key: 'change_order_approval_expiry_hours', label: 'Change Order Approval Expiry',
            description: 'Hours before an approved but unpaid change order expires.',
            valueType: 'integer', value: '24', defaultValue: '24', minValue: 1, maxValue: 168,
            allowedValues: null, unit: 'hours', isSensitive: false, isDefault: true,
            requiresRestart: false, runtimeStatus: 'held', runtimeLabel: 'Launch hold',
            runtimeSummary: 'This value currently moves the payment deadline for change orders that customers already approved. Editing is held under E61 until each approval stores and displays its own prospective expiry timestamp.',
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

  const row = (await screen.findByText('Change Order Approval Expiry')).closest('li');
  expect(row).not.toBeNull();
  expect(within(row!).getByText('Launch hold')).toBeVisible();
  expect(within(row!).getByText(/moves the payment deadline for change orders that customers already approved/i)).toBeVisible();
  expect(within(row!).queryByRole('button', { name: 'Edit setting change_order_approval_expiry_hours' })).not.toBeInTheDocument();
  expect(within(row!).queryByRole('button', { name: 'Reset change_order_approval_expiry_hours to default' })).not.toBeInTheDocument();
});
