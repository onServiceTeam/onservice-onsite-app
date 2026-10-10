import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

import AuditLogPage from '../AuditLogPage';
import NotificationTemplatesPage from '../NotificationTemplatesPage';

it('Bug UX-1119 - a notification-template audit event opens the exact current record when its list fails', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'config_changed',
      entityType: 'notification_template', entityId: TEMPLATE_ID, oldValues: null,
      newValues: { op: 'update', slug: 'booking_matched' }, ipAddress: null, userAgent: null,
      reason: null, createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === `/api/v1/admin/notification-templates/${TEMPLATE_ID}`) return { data: { success: true, data: {
      id: TEMPLATE_ID, slug: 'booking_matched', titleTemplate: 'Provider assigned',
      bodyTemplate: '{{providerName}} accepted booking {{bookingId}}.', type: 'booking_update',
      channel: 'all', isActive: true, variables: ['providerName', 'bookingId'],
      runtimeStatus: 'connected', runtimeVariables: ['bookingId', 'providerName'],
      runtimeChannels: ['in_app', 'push'], createdAt: '2026-08-31T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/notification-templates') throw new Error('Template list unavailable');
    throw new Error(`Unexpected GET ${url}`);
  });

  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const audit = render(<QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('link', { name: /Open current notification template record/ })).toHaveAttribute(
    'href', `/notification-templates?templateId=${TEMPLATE_ID}`,
  );
  audit.unmount();

  const templateClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={templateClient}><MemoryRouter initialEntries={[`/notification-templates?templateId=${TEMPLATE_ID}`]}><NotificationTemplatesPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('Linked current record')).toBeVisible();
  expect(screen.getByText(TEMPLATE_ID)).toBeVisible();
  expect(screen.getByText(/not an immutable historical version/i)).toBeVisible();
  expect(screen.getByText('Active override; built-in fallback remains available')).toBeVisible();
  expect(await screen.findByText('Notification templates could not be loaded')).toBeVisible();
});
