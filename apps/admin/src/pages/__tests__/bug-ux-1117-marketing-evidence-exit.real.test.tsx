import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PROMO_CODE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }) }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ promoRedemptionEnabled: false }) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import MarketingPage from '../MarketingPage';

function LocationEvidence(): React.ReactElement {
  return <output aria-label="Current Marketing query">{useLocation().search}</output>;
}

it('Bug UX-1117 - clearing exact Marketing evidence removes only target IDs and preserves the selected tab and filters', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/marketing/promos/${PROMO_CODE_ID}`) return { data: { success: true, data: {
      id: PROMO_CODE_ID, code: 'CEBU10', description: null, discountType: 'percentage', discountValue: 10,
      maxDiscountCentavos: null, minimumOrderCentavos: 0, usageLimitTotal: null, usageLimitPerCustomer: 1,
      timesUsed: 0, validFrom: '2026-09-01T00:00:00.000Z', validUntil: null, active: true,
      createdAt: '2026-08-31T00:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/marketing/promos') return { data: { success: true, data: { rows: [], total: 0 } } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/marketing?tab=promos&promoCodeId=${PROMO_CODE_ID}&status=active`]}><LocationEvidence /><MarketingPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText(PROMO_CODE_ID)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.queryByText('Selected audit evidence')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Current Marketing query')).toHaveTextContent('?tab=promos&status=active');
});
