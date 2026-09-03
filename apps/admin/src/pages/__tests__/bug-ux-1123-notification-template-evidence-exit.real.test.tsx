import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const TEMPLATE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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

function LocationEvidence(): React.ReactElement {
  return <output aria-label="Current template query">{useLocation().search}</output>;
}

it('Bug UX-1123 - clearing linked template evidence preserves ordinary page and filter state', async () => {
  const template = {
    id: TEMPLATE_ID, slug: 'booking_matched', titleTemplate: 'Provider assigned',
    bodyTemplate: '{{providerName}} accepted booking {{bookingId}}.', type: 'booking_update',
    channel: 'all', isActive: true, variables: ['providerName', 'bookingId'],
    runtimeStatus: 'connected', runtimeVariables: ['bookingId', 'providerName'], runtimeChannels: ['in_app', 'push'],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z',
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/notification-templates/${TEMPLATE_ID}`) return { data: { success: true, data: template } };
    if (url === '/api/v1/admin/notification-templates') return { data: {
      data: [], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
    } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/notification-templates?templateId=${TEMPLATE_ID}&type=booking_update&page=2`]}><LocationEvidence /><NotificationTemplatesPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Linked current record')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.queryByText('Linked current record')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Current template query')).toHaveTextContent('?type=booking_update&page=2');
});
