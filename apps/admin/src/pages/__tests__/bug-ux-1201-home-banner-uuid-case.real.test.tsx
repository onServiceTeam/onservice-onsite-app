import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PROMOTION_ID = '12010000-abcd-4abc-8def-000000001201';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import MarketingPage from '../MarketingPage';

it('Bug UX-1201 - an uppercase home-banner UUID loads the canonical exact audit record', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/promotions/${PROMOTION_ID}`) return { data: { success: true, data: {
      id: PROMOTION_ID, title: 'Canonical customer banner', subtitle: 'Verified record', imageUrl: null,
      badge: 'TRUSTED', ctaText: 'Browse services', ctaLink: '/customer/search', targetAudience: 'all',
      startDate: '2026-09-01T00:00:00.000Z', endDate: null, isActive: true, displayOrder: 1,
      createdAt: '2026-08-31T00:00:00.000Z',
    } } };
    if (url === '/api/v1/promotions') return { data: { success: true, data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/marketing?promotionId=${PROMOTION_ID.toUpperCase()}`]}><MarketingPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Canonical customer banner')).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/promotions/${PROMOTION_ID}`);
  expect(screen.getByText(PROMOTION_ID)).toBeVisible();
});
