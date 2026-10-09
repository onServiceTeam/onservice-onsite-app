import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PROMO_CODE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ promoRedemptionEnabled: false }) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import MarketingPage from '../MarketingPage';

it('Bug UX-1112 - a legacy promo configuration event opens the exact staged promo code outside its list', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'config_changed',
      entityType: 'config', entityId: PROMO_CODE_ID, oldValues: null,
      newValues: { kind: 'promo_update', code: 'CEBU10' }, ipAddress: null, userAgent: null,
      reason: 'Promo code updated', createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === `/api/v1/admin/marketing/promos/${PROMO_CODE_ID}`) return { data: { success: true, data: {
      id: PROMO_CODE_ID, code: 'CEBU10', description: 'Cebu launch', discountType: 'percentage',
      discountValue: 10, maxDiscountCentavos: 50000, minimumOrderCentavos: 100000,
      usageLimitTotal: 100, usageLimitPerCustomer: 1, timesUsed: 0,
      validFrom: '2026-09-01T00:00:00.000Z', validUntil: '2026-09-30T00:00:00.000Z',
      active: true, createdAt: '2026-08-31T00:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/marketing/promos') throw new Error('List unavailable');
    throw new Error(`Unexpected GET ${url}`);
  });

  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const audit = render(<QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('link', { name: /Open exact promo code/ })).toHaveAttribute(
    'href', `/marketing?tab=promos&promoCodeId=${PROMO_CODE_ID}`,
  );
  audit.unmount();

  const marketingClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={marketingClient}><MemoryRouter initialEntries={[`/marketing?tab=promos&promoCodeId=${PROMO_CODE_ID}`]}><MarketingPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('CEBU10')).toBeVisible();
  expect(screen.getByText('Selected audit evidence')).toBeVisible();
  expect(screen.getByText(PROMO_CODE_ID)).toBeVisible();
  expect(screen.getByText(/runtime gate, validity, and limits still apply/i)).toBeVisible();
});
