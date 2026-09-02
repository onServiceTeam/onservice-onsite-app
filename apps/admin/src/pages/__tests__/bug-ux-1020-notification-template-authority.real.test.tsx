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
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import NotificationTemplatesPage from '../NotificationTemplatesPage';

it('Bug UX-1020 — ordinary admins receive an honest read-only template workspace with no mutation controls', async () => {
  apiMocks.get.mockResolvedValue({
    data: {
      data: [{
        id: 'template-1', slug: 'booking_matched', titleTemplate: 'Provider assigned',
        bodyTemplate: '{{providerName}} accepted booking {{bookingId}}.', type: 'booking_update',
        channel: 'all', isActive: true, variables: ['providerName', 'bookingId'],
        runtimeStatus: 'connected', runtimeVariables: ['bookingId', 'providerName'],
        runtimeChannels: ['in_app', 'push'], createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
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

  expect(await screen.findByText('Read-only operator access')).toBeVisible();
  expect(screen.queryByRole('button', { name: /new template/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /edit template booking_matched/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /toggle template booking_matched/i })).not.toBeInTheDocument();
  expect(await screen.findByText('Read only')).toBeVisible();
});
