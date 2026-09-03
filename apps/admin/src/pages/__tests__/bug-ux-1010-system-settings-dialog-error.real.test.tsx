import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

it('Bug UX-1010 — a failed settings reset stays visible inside the accessible impact dialog', async () => {
  const setting = {
    id: 'setting-1010', category: 'fees', subcategory: null, key: 'service_fee_rate',
    label: 'Service Fee Rate', description: 'Customer service fee percentage.',
    valueType: 'percent', value: '2', defaultValue: '0', minValue: 0, maxValue: 50,
    allowedValues: null, unit: '%', isSensitive: false, isDefault: false,
    requiresRestart: false, runtimeStatus: 'live', runtimeLabel: 'Live control',
    runtimeSummary: 'New booking financial terms snapshot this value.', editable: true,
    updatedAt: '2026-09-02T02:00:00.000Z',
  };
  apiMocks.get.mockResolvedValue({
    data: {
      data: {
        categories: [{ category: 'fees', count: 1 }],
        settings: { fees: [setting] },
      },
    },
  });
  apiMocks.post.mockRejectedValue(new Error('A newer value exists. Reload settings before retrying.'));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SystemSettingsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Reset service_fee_rate to default' }));
  const dialog = screen.getByRole('dialog', { name: 'Reset to the approved default?' });
  expect(dialog).toBeVisible();
  fireEvent.change(within(dialog).getByLabelText('Audit reason'), {
    target: { value: 'Restore the approved launch fee after review.' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm reset' }));

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
    '/api/v1/admin/settings/service_fee_rate/reset',
    {
      reason: 'Restore the approved launch fee after review.',
      expectedUpdatedAt: setting.updatedAt,
    },
  ));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'A newer value exists. Reload settings before retrying.',
  );
});
