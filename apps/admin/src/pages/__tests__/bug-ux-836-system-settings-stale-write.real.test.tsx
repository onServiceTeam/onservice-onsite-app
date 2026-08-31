import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

afterEach(() => {
  vi.restoreAllMocks();
  apiMocks.get.mockReset();
  apiMocks.put.mockReset();
  apiMocks.post.mockReset();
});

it('Bug UX-836 — saving a setting submits the exact loaded version so a stale admin screen cannot overwrite a newer change', async () => {
  const updatedAt = '2026-08-31T12:34:56.789Z';
  const setting = {
    id: 'setting-1', category: 'fees', subcategory: null, key: 'service_fee_rate',
    label: 'Service Fee Rate', description: 'Customer service fee percentage.',
    valueType: 'percent', value: '10', defaultValue: '0', minValue: 0, maxValue: 50,
    allowedValues: null, unit: '%', isSensitive: false, isDefault: false,
    requiresRestart: false, runtimeStatus: 'live', runtimeLabel: 'Live control',
    runtimeSummary: 'Used for new booking calculations.', editable: true, updatedAt,
  };
  apiMocks.get.mockResolvedValue({
    data: {
      data: {
        categories: [{ category: 'fees', count: 1 }],
        settings: { fees: [setting] },
      },
    },
  });
  apiMocks.put.mockResolvedValue({ data: { data: { ...setting, value: '11' } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SystemSettingsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Edit setting service_fee_rate' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Value for service_fee_rate' }), {
    target: { value: '11' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Audit reason for service_fee_rate' }), {
    target: { value: 'Approved customer fee adjustment.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  expect(screen.getByRole('dialog', { name: 'Confirm this setting change' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));

  await waitFor(() => {
    expect(apiMocks.put).toHaveBeenCalledWith('/api/v1/admin/settings/service_fee_rate', {
      value: '11',
      reason: 'Approved customer fee adjustment.',
      expectedUpdatedAt: updatedAt,
    });
  });
});
