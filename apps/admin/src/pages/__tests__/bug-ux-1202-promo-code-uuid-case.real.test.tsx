import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PROMO_CODE_ID = '12020000-abcd-4abc-8def-000000001202';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ promoRedemptionEnabled: false }) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import MarketingPage from '../MarketingPage';

it('Bug UX-1202 - an uppercase promo-code UUID loads the canonical exact audit record', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/marketing/promos/${PROMO_CODE_ID}`) return { data: { success: true, data: {
      id: PROMO_CODE_ID, code: 'CASE10', description: 'Canonical promo', discountType: 'percentage',
      discountValue: 10, maxDiscountCentavos: 50000, minimumOrderCentavos: 100000,
      usageLimitTotal: 100, usageLimitPerCustomer: 1, timesUsed: 0,
      validFrom: '2026-09-01T00:00:00.000Z', validUntil: '2026-09-30T00:00:00.000Z',
      active: true, createdAt: '2026-08-31T00:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/marketing/promos') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/marketing?promoCodeId=${PROMO_CODE_ID.toUpperCase()}`]}><MarketingPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('CASE10')).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/admin/marketing/promos/${PROMO_CODE_ID}`);
  expect(screen.getByText(PROMO_CODE_ID)).toBeVisible();
});
