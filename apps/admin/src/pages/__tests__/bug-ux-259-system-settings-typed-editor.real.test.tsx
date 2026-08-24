import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

it('Bug UX-259 — a live boolean setting opens a bounded choice editor instead of free text', async () => {
  apiMocks.get.mockResolvedValueOnce({
    data: {
      data: {
        categories: [{ category: 'dispatch', count: 1 }],
        settings: {
          dispatch: [{
            id: 'dispatch-1', category: 'dispatch', subcategory: null,
            key: 'auto_dispatch_enabled', label: 'Automatic Dispatch', description: 'Offer jobs automatically.',
            valueType: 'boolean', value: 'true', defaultValue: 'true', minValue: null, maxValue: null,
            allowedValues: null, unit: null, isSensitive: false, isDefault: true, requiresRestart: false,
            runtimeStatus: 'live', runtimeLabel: 'Live control', runtimeSummary: 'Used for new bookings.',
            editable: true, updatedAt: '2026-08-24T00:00:00.000Z',
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

  fireEvent.click(await screen.findByRole('button', { name: 'Edit setting auto_dispatch_enabled' }));

  const editor = screen.getByRole('combobox', { name: 'Value for auto_dispatch_enabled' });
  expect(editor).toHaveValue('true');
  expect(screen.getByRole('option', { name: 'Enabled' })).toBeVisible();
  expect(screen.getByRole('option', { name: 'Disabled' })).toBeVisible();
  expect(screen.queryByRole('textbox', { name: 'Value for auto_dispatch_enabled' })).not.toBeInTheDocument();
});
