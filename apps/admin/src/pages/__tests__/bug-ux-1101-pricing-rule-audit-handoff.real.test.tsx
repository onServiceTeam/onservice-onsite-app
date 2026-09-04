import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const RULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import PricingRulesPage from '../PricingRulesPage';

const exactRule = {
  id: RULE_ID,
  name: 'Cebu evening capacity',
  type: 'peak_hours',
  multiplier: 1.25,
  rushHoursThreshold: null,
  holidayDate: null,
  peakStartTime: '18:00:00',
  peakEndTime: '21:00:00',
  peakDaysOfWeek: [1, 2, 3, 4, 5],
  categoryId: null,
  serviceAreaId: null,
  isActive: true,
  publicationStatus: 'published',
  priority: 20,
  platformSurgeShare: 0.4,
  description: 'Published capacity rule',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-03T10:00:00.000Z',
  publishReason: 'Validated across representative Cebu services.',
  publishedAt: '2026-09-03T10:00:00.000Z',
  retireReason: null,
  retiredAt: null,
};

it('Bug UX-1101 - a pricing audit event opens the exact retained rule even when the paginated list fails', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'config_changed',
      entityType: 'pricing_rule', entityId: RULE_ID, oldValues: null,
      newValues: { op: 'published' }, ipAddress: null, userAgent: null,
      reason: exactRule.publishReason, createdAt: exactRule.publishedAt,
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === `/api/v1/admin/pricing-rules/${RULE_ID}`) return { data: { success: true, data: exactRule } };
    if (url === '/api/v1/admin/pricing-rules') throw new Error('List unavailable');
    if (url === '/api/v1/catalog/admin/full') return { data: { success: true, data: [] } };
    if (url === '/api/v1/admin/service-areas') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const audit = render(
    <QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>,
  );
  expect(await screen.findByRole('link', { name: /Open exact pricing rule/ })).toHaveAttribute(
    'href',
    `/pricing-rules?ruleId=${RULE_ID}`,
  );
  audit.unmount();

  const pricingClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={pricingClient}>
      <MemoryRouter initialEntries={[`/pricing-rules?ruleId=${RULE_ID}`]}><PricingRulesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Cebu evening capacity')).toBeVisible();
  expect(screen.getByText('Selected audit evidence')).toBeVisible();
  expect(screen.getByText(RULE_ID)).toBeVisible();
  expect(await screen.findByRole('heading', { name: 'Pricing rules unavailable' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Retry pricing rules' })).toBeEnabled();
});
