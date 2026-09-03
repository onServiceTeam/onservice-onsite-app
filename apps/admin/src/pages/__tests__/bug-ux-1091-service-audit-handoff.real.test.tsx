import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CATEGORY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get: apiMocks.get }, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import CatalogPage from '../CatalogPage';

it('Bug UX-1091 - a customer-service audit event opens and marks the exact service under its retained category', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', targetCategoryId: CATEGORY_ID,
      targetSubcategoryId: SERVICE_ID, action: 'service_subcategory_updated',
      entityType: 'service_subcategory', entityId: SERVICE_ID, oldValues: null, newValues: {},
      ipAddress: null, userAgent: null, reason: 'scope changed', createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === '/api/v1/catalog/admin/full') return { data: { data: [{
      id: CATEGORY_ID, name: 'Cleaning', slug: 'cleaning', description: '', iconUrl: null,
      displayOrder: 1, subcategories: [{
        id: SERVICE_ID, categoryId: CATEGORY_ID, name: 'Deep Cleaning', slug: 'deep-cleaning',
        description: 'A complete customer-facing deep-cleaning service scope.', pricingType: 'fixed',
        basePrice: 250000, minPrice: null, maxPrice: null, estimatedDurationMinutes: 180,
        unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1, isActive: true,
      }],
    }] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const audit = render(<QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('link', { name: /Open exact customer service/ })).toHaveAttribute(
    'href', `/catalog?categoryId=${CATEGORY_ID}&subcategoryId=${SERVICE_ID}`,
  );
  audit.unmount();

  const catalogClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={catalogClient}><MemoryRouter initialEntries={[`/catalog?categoryId=${CATEGORY_ID}&subcategoryId=${SERVICE_ID}`]}><CatalogPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('Deep Cleaning')).toBeVisible();
  expect(screen.getByText('Selected catalog record')).toBeInTheDocument();
  expect(apiMocks.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/addons$/));
});
