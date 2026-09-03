import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const TEMPLATE_ID = '12040000-abcd-4abc-8def-000000001204';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import NotificationTemplatesPage from '../NotificationTemplatesPage';

it('Bug UX-1204 - an uppercase notification-template UUID loads the canonical exact record', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/notification-templates/${TEMPLATE_ID}`) return { data: { success: true, data: {
      id: TEMPLATE_ID, slug: 'booking_matched', titleTemplate: 'Canonical provider assignment',
      bodyTemplate: '{{providerName}} accepted booking {{bookingId}}.', type: 'booking_update',
      channel: 'all', isActive: true, variables: ['providerName', 'bookingId'],
      runtimeStatus: 'connected', runtimeVariables: ['bookingId', 'providerName'],
      runtimeChannels: ['in_app', 'push'], createdAt: '2026-08-31T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/notification-templates') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/notification-templates?templateId=${TEMPLATE_ID.toUpperCase()}`]}><NotificationTemplatesPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Linked current record')).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/admin/notification-templates/${TEMPLATE_ID}`);
  expect(screen.getByText(TEMPLATE_ID)).toBeVisible();
});
