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

function setting(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'setting-id', category: 'auth', subcategory: null, key: 'otp_length',
    label: 'OTP Length', description: 'Number of OTP digits', valueType: 'integer',
    value: '6', defaultValue: '6', minValue: 4, maxValue: 8, allowedValues: null,
    unit: 'digits', isSensitive: false, isDefault: true, requiresRestart: false,
    runtimeStatus: 'live', runtimeLabel: 'Live control',
    runtimeSummary: 'Authoritative workflows consume this value for new operations.',
    editable: true, updatedAt: '2026-08-24T00:00:00.000Z', ...overrides,
  };
}

it('Bug UX-252 — settings page distinguishes live controls from nonfunctional read-only rows', async () => {
  apiMocks.get.mockResolvedValueOnce({
    data: {
      data: {
        categories: [{ category: 'auth', count: 2 }],
        settings: {
          auth: [
            setting({}),
            setting({
              id: 'jwt-setting', key: 'jwt_access_expires', label: 'Access Token TTL',
              valueType: 'string', value: '15m', defaultValue: '15m', minValue: null,
              maxValue: null, runtimeStatus: 'not_connected', runtimeLabel: 'Not connected',
              runtimeSummary: 'Access-token lifetime is controlled by deployment configuration.',
              editable: false,
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

  expect(await screen.findByText('Not connected')).toBeVisible();
  expect(screen.getByText('Live control')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Edit setting jwt_access_expires' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit setting otp_length' })).toBeVisible();
  expect(screen.queryByText(/Changes take effect within 60 seconds/)).not.toBeInTheDocument();
});
