import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

it('Bug UX-678 — staff can distinguish connected copy from reference-only copy and preview resolved values', async () => {
  apiMocks.get.mockResolvedValue({
    data: {
      data: [
        {
          id: 'template-1', slug: 'booking_matched', titleTemplate: 'Provider assigned',
          bodyTemplate: '{{providerName}} accepted booking {{bookingId}}.', type: 'booking_update',
          channel: 'all', isActive: true, variables: ['providerName', 'bookingId'],
          runtimeStatus: 'connected', runtimeVariables: ['bookingId', 'providerName'],
          createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
        },
        {
          id: 'template-2', slug: 'payment_received', titleTemplate: 'Payment received',
          bodyTemplate: 'Payment {{amount}} was received.', type: 'payment', channel: 'all',
          isActive: true, variables: ['amount'], runtimeStatus: 'reference_only', runtimeVariables: null,
          createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><NotificationTemplatesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Connected')).length).toBeGreaterThan(0);
  expect(screen.getByText('Reference only')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Edit template booking_matched' }));
  const preview = screen.getByRole('region', { name: 'Template preview' });
  expect(within(preview).getByText('Maria Santos accepted booking OS-1042.')).toBeVisible();
  expect(screen.getByText(/This workflow can supply only/)).toHaveTextContent('{{bookingId}}');
});
