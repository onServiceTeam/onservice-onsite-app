import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

it('Bug UX-849 — setting history identifies the operator and business reason for each change', async () => {
  apiMocks.get
    .mockResolvedValueOnce({
      data: {
        data: {
          categories: [{ category: 'auth', count: 1 }],
          settings: {
            auth: [{
              id: 'otp', category: 'auth', subcategory: null, key: 'otp_length', label: 'OTP length',
              description: null, valueType: 'integer', value: '6', defaultValue: '6', minValue: 4,
              maxValue: 8, allowedValues: null, unit: 'digits', isSensitive: false, isDefault: true,
              requiresRestart: false, runtimeStatus: 'live', runtimeLabel: 'Live control',
              runtimeSummary: 'Used for new OTP challenges.', editable: true,
              updatedAt: '2026-08-31T00:00:00.000Z',
            }],
          },
        },
      },
    })
    .mockResolvedValueOnce({
      data: {
        data: [{
          id: 'audit-1', setting_key: 'otp_length', old_value: '5', new_value: '6',
          changed_by: 'admin-1', changed_by_name: 'Maria Santos', changed_by_email: 'maria@example.com',
          change_reason: 'Restore the approved OTP policy.', created_at: '2026-08-31T12:00:00.000Z',
        }],
      },
    });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SystemSettingsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'View change history for otp_length' }));
  expect(await screen.findByText('Restore the approved OTP policy.')).toBeVisible();
  expect(screen.getByText(/Maria Santos/)).toBeVisible();
});
