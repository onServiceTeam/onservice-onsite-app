import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const REQUESTED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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

it('Bug UX-1122 - a mismatched template response is rejected instead of being shown as the linked current record', async () => {
  const wrongTemplate = {
    id: OTHER_ID, slug: 'wrong_template', titleTemplate: 'Wrong title', bodyTemplate: 'Wrong current body',
    type: 'system', channel: 'email', isActive: true, variables: [], runtimeStatus: 'reference_only',
    runtimeVariables: null, runtimeChannels: null, createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/notification-templates/${REQUESTED_ID}`) return { data: { success: true, data: wrongTemplate } };
    if (url === '/api/v1/admin/notification-templates') return { data: {
      data: [wrongTemplate], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/notification-templates?templateId=${REQUESTED_ID}`]}><NotificationTemplatesPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Selected notification template could not be loaded')).toBeVisible();
  expect(screen.queryByText(REQUESTED_ID)).not.toBeInTheDocument();
  expect(screen.getByText('wrong_template')).toBeVisible();
  expect(screen.queryByText('Linked current record')).not.toBeInTheDocument();
});
