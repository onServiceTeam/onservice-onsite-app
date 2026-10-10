import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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

it('Bug UX-1021 — connected templates show and lock the real in-app plus push delivery boundary', async () => {
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

  expect((await screen.findAllByText('In-app + Push')).length).toBeGreaterThan(0);
  expect(screen.getByText(/SMS, email, test-send, per-channel variants, and version publication are not connected/i)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Edit template booking_matched' }));
  expect(screen.getByLabelText('Runtime delivery channels')).toBeDisabled();
  expect(screen.getByText('Managed by the live workflow. SMS and email are not connected.')).toBeVisible();
  expect(screen.queryByLabelText('Stored channel metadata')).not.toBeInTheDocument();
});
