import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import NotificationTemplatesPage from '../NotificationTemplatesPage';

it('Bug UX-679 — notification template filters and row actions expose tablet-safe 44px targets', async () => {
  apiMocks.get.mockResolvedValue({
    data: {
      data: [{
        id: 'template-1', slug: 'booking_matched', titleTemplate: 'Provider assigned',
        bodyTemplate: '{{providerName}} accepted booking {{bookingId}}.', type: 'booking_update',
        channel: 'all', isActive: true, variables: ['providerName', 'bookingId'],
        runtimeStatus: 'connected', runtimeVariables: ['bookingId', 'providerName'],
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><NotificationTemplatesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Filter templates by type')).toHaveClass('min-h-11');
  expect(screen.getByLabelText('Filter templates by channel')).toHaveClass('min-h-11');
  expect(await screen.findByRole('button', { name: 'Toggle template booking_matched inactive' })).toHaveClass('min-h-11');
  expect(screen.getByRole('button', { name: 'Edit template booking_matched' })).toHaveClass('min-h-11');
  expect(screen.getByRole('button', { name: 'Delete template booking_matched' })).toHaveClass('min-h-11');
});
