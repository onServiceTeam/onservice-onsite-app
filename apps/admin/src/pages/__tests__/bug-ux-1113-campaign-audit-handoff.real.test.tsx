import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CAMPAIGN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import MarketingPage from '../MarketingPage';

it('Bug UX-1113 - a legacy campaign configuration event opens the exact manual tracking record outside its list', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'config_changed',
      entityType: 'config', entityId: CAMPAIGN_ID, oldValues: null,
      newValues: { kind: 'campaign_update', name: 'Cebu acquisition' }, ipAddress: null, userAgent: null,
      reason: 'Campaign updated', createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === `/api/v1/admin/marketing/campaigns/${CAMPAIGN_ID}`) return { data: { success: true, data: {
      id: CAMPAIGN_ID, name: 'Cebu acquisition', channel: 'facebook_ads',
      startedAt: '2026-09-01T00:00:00.000Z', endedAt: null, spendCentavos: 250000,
      attributedSignups: 12, attributedFirstBookings: 4, attributedRevenueCentavos: 600000,
      notes: 'Staff entered', createdAt: '2026-08-31T00:00:00.000Z', cpaCentavos: 20833, roiPercent: 140,
    } } };
    if (url === '/api/v1/admin/marketing/channels') return { data: { success: true, data: ['facebook_ads'] } };
    if (url === '/api/v1/admin/marketing/campaigns/channels') return { data: { success: true, data: ['facebook_ads'] } };
    if (url === '/api/v1/admin/marketing/campaigns') throw new Error('List unavailable');
    throw new Error(`Unexpected GET ${url}`);
  });

  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const audit = render(<QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('link', { name: /Open exact campaign/ })).toHaveAttribute(
    'href', `/marketing?tab=campaigns&campaignId=${CAMPAIGN_ID}`,
  );
  audit.unmount();

  const marketingClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={marketingClient}><MemoryRouter initialEntries={[`/marketing?tab=campaigns&campaignId=${CAMPAIGN_ID}`]}><MarketingPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('Cebu acquisition')).toBeVisible();
  expect(screen.getByText('Selected audit evidence')).toBeVisible();
  expect(screen.getByText(CAMPAIGN_ID)).toBeVisible();
  expect(screen.getByText('Staff-reported tracking record')).toBeVisible();
});
