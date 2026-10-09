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

it('Bug UX-848 — editing a sensitive setting starts with an empty password field instead of masked data', async () => {
  apiMocks.get.mockResolvedValueOnce({
    data: {
      data: {
        categories: [{ category: 'dispatch', count: 1 }],
        settings: {
          dispatch: [{
            id: 'map-key', category: 'dispatch', subcategory: 'map', key: 'map_tile_api_key',
            label: 'Map API key', description: 'Secret key for map tiles.', valueType: 'string',
            value: '••••••', defaultValue: '••••••', minValue: null, maxValue: null, allowedValues: null,
            unit: null, isSensitive: true, isDefault: false, requiresRestart: false,
            runtimeStatus: 'live', runtimeLabel: 'Live control', runtimeSummary: 'Used for new map requests.',
            editable: true, updatedAt: '2026-08-31T00:00:00.000Z',
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

  fireEvent.click(await screen.findByRole('button', { name: 'Edit setting map_tile_api_key' }));
  const field = screen.getByLabelText('Value for map_tile_api_key');
  expect(field).toHaveAttribute('type', 'password');
  expect(field).toHaveValue('');
  expect(screen.getByText(/stored secret is never returned/i)).toBeVisible();
});
