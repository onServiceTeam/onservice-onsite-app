import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PROMOTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import MarketingPage from '../MarketingPage';

it('Bug UX-1111 - a promotion audit event opens the exact retained home banner when its list fails', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'admin', action: 'config_changed',
      entityType: 'promotion', entityId: PROMOTION_ID, oldValues: null,
      newValues: { op: 'update' }, ipAddress: null, userAgent: null,
      reason: null, createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === `/api/v1/promotions/${PROMOTION_ID}`) return { data: { success: true, data: {
      id: PROMOTION_ID, title: 'Book with confidence', subtitle: 'Vetted providers', imageUrl: null,
      badge: 'TRUSTED', ctaText: 'Browse services', ctaLink: '/customer/search', targetAudience: 'all',
      startDate: '2026-09-01T00:00:00.000Z', endDate: null, isActive: true, displayOrder: 1,
      createdAt: '2026-08-31T00:00:00.000Z',
    } } };
    if (url === '/api/v1/promotions') throw new Error('List unavailable');
    throw new Error(`Unexpected GET ${url}`);
  });

  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const audit = render(<QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('link', { name: /Open exact home banner/ })).toHaveAttribute(
    'href', `/marketing?tab=banners&promotionId=${PROMOTION_ID}`,
  );
  audit.unmount();

  const marketingClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={marketingClient}><MemoryRouter initialEntries={[`/marketing?tab=banners&promotionId=${PROMOTION_ID}`]}><MarketingPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('Book with confidence')).toBeVisible();
  expect(screen.getByText('Selected audit evidence')).toBeVisible();
  expect(screen.getByText(PROMOTION_ID)).toBeVisible();
  expect(await screen.findByText('Failed to load home banners')).toBeVisible();
});
