import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: () => 'Request failed',
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

function heldBusinessSetting(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'business-setting',
    category: 'business',
    subcategory: null,
    key: 'business_account_types',
    label: 'Business Account Types',
    description: 'Available business account classifications',
    valueType: 'string',
    value: 'sme,enterprise,property_manager,government',
    defaultValue: 'sme,enterprise,property_manager,government',
    minValue: null,
    maxValue: null,
    allowedValues: null,
    unit: null,
    isSensitive: false,
    isDefault: true,
    requiresRestart: false,
    runtimeStatus: 'held',
    runtimeLabel: 'Launch hold',
    runtimeSummary: 'Business account types are constrained by the current database schema. Editing this list is blocked under E58 so customer account creation cannot accept a value PostgreSQL will reject.',
    editable: false,
    updatedAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

it('Bug UX-985 — B2B enum controls render as explained read-only holds in Admin Settings', async () => {
  apiMocks.get.mockResolvedValueOnce({
    data: {
      data: {
        categories: [{ category: 'business', count: 2 }],
        settings: {
          business: [
            heldBusinessSetting({}),
            heldBusinessSetting({
              id: 'payment-term-setting',
              key: 'business_payment_terms',
              label: 'Business Payment Terms',
              value: 'net_15,net_30,net_60',
              defaultValue: 'net_15,net_30,net_60',
              runtimeSummary: 'Business payment terms are constrained by the database and due-date calculation code. Editing this list is blocked under E58 until terms are prospective, versioned definitions with an explicit number of days.',
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

  expect(await screen.findByText(/customer account creation cannot accept a value PostgreSQL will reject/i)).toBeVisible();
  expect(screen.getByText(/terms are prospective, versioned definitions with an explicit number of days/i)).toBeVisible();
  expect(screen.getAllByText('Launch hold')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Edit setting business_account_types' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit setting business_payment_terms' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reset business_account_types to default' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reset business_payment_terms to default' })).not.toBeInTheDocument();
});
