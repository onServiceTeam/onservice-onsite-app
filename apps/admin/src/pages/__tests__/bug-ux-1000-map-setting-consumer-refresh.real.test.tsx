import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

it('Bug UX-1000 — saving a map setting invalidates the Dispatch tile configuration cache', async () => {
  const setting = {
    id: 'map-url', category: 'dispatch', subcategory: 'map', key: 'map_tile_url',
    label: 'Map tile URL template', description: 'HTTPS tile source for the dispatch map.',
    valueType: 'string', value: 'https://old.example.test/{z}/{x}/{y}.png',
    defaultValue: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    minValue: null, maxValue: null, allowedValues: null, unit: null,
    isSensitive: false, isDefault: false, requiresRestart: false,
    runtimeStatus: 'live', runtimeLabel: 'Live control',
    runtimeSummary: 'The Dispatch Console uses this HTTPS tile template on its next load after save.',
    editable: true, updatedAt: '2026-09-02T01:00:00.000Z',
  };
  apiMocks.get.mockResolvedValue({
    data: {
      data: {
        categories: [{ category: 'dispatch', count: 1 }],
        settings: { dispatch: [setting] },
      },
    },
  });
  apiMocks.put.mockResolvedValue({ data: { data: { ...setting, value: 'https://new.example.test/{z}/{x}/{y}.png' } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/settings?category=dispatch']}>
        <SystemSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Edit setting map_tile_url' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Value for map_tile_url' }), {
    target: { value: 'https://new.example.test/{z}/{x}/{y}.png' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Audit reason for map_tile_url' }), {
    target: { value: 'Move dispatch to the approved tile provider.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));

  await waitFor(() => {
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dispatch', 'map-config'] });
  });
});
