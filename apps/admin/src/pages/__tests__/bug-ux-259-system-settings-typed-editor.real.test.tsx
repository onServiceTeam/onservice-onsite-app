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
        categories: [{ category: 'security', count: 1 }],
        settings: {
          security: [{
            id: 'security-1', category: 'security', subcategory: null,
            key: 'refresh_token_strict_fingerprint', label: 'Strict Session Fingerprint', description: 'Reject changed device fingerprints.',
            valueType: 'boolean', value: 'false', defaultValue: 'false', minValue: null, maxValue: null,
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

  fireEvent.click(await screen.findByRole('button', { name: 'Edit setting refresh_token_strict_fingerprint' }));

  const editor = screen.getByRole('combobox', { name: 'Value for refresh_token_strict_fingerprint' });
  expect(editor).toHaveValue('false');
  expect(screen.getByRole('option', { name: 'Enabled' })).toBeVisible();
  expect(screen.getByRole('option', { name: 'Disabled' })).toBeVisible();
  expect(screen.queryByRole('textbox', { name: 'Value for refresh_token_strict_fingerprint' })).not.toBeInTheDocument();
});
