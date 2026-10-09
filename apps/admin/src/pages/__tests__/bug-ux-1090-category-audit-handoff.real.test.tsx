import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CATEGORY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get: apiMocks.get }, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import CatalogPage from '../CatalogPage';

it('Bug UX-1090 - a category audit event opens and marks the exact retained catalog category', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'service_category_updated',
      entityType: 'service_category', entityId: CATEGORY_ID, oldValues: null, newValues: {},
      ipAddress: null, userAgent: null, reason: 'copy changed', createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === '/api/v1/catalog/admin/full') return { data: { data: [{
      id: CATEGORY_ID, name: 'Cleaning', slug: 'cleaning', description: '', iconUrl: null,
      displayOrder: 1, subcategories: [],
    }] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const audit = render(<QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('link', { name: /Open exact service category/ })).toHaveAttribute('href', `/catalog?categoryId=${CATEGORY_ID}`);
  audit.unmount();

  const catalogClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={catalogClient}><MemoryRouter initialEntries={[`/catalog?categoryId=${CATEGORY_ID}`]}><CatalogPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('button', { name: 'Collapse Cleaning services' })).toBeVisible();
  expect(screen.getByText('Selected catalog record')).toBeInTheDocument();
});
