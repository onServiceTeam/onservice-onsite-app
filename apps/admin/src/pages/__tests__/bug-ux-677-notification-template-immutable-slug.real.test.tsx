import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import NotificationTemplatesPage from '../NotificationTemplatesPage';

it('Bug UX-677 — editing a template locks its routing slug and omits the slug from the update request', async () => {
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
  apiMocks.put.mockResolvedValue({ data: { success: true } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><NotificationTemplatesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Edit template booking_matched' }));
  expect(screen.getByLabelText('Slug *')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Title template *'), { target: { value: 'Provider ready' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update template' }));
  fireEvent.change(await screen.findByLabelText('Change reason'), {
    target: { value: 'Clarifying provider assignment copy for customers.' },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Update' }));

  await waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith(
    '/api/v1/admin/notification-templates/template-1',
    {
      titleTemplate: 'Provider ready',
      bodyTemplate: '{{providerName}} accepted booking {{bookingId}}.',
      type: 'booking_update',
      isActive: true,
      reason: 'Clarifying provider assignment copy for customers.',
    },
  ));
});
