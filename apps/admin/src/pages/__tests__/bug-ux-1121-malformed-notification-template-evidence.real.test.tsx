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
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import NotificationTemplatesPage from '../NotificationTemplatesPage';

it('Bug UX-1121 - a malformed notification-template audit ID is rejected without requesting an arbitrary detail route', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/notification-templates') return { data: {
      data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/notification-templates?templateId=not-a-template']}><NotificationTemplatesPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText(/notification-template ID is invalid/i)).toBeVisible();
  expect(apiMocks.get).not.toHaveBeenCalledWith('/api/v1/admin/notification-templates/not-a-template');
});
