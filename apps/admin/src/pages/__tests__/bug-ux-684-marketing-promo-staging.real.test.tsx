import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import MarketingPage from '../MarketingPage';

it('Bug UX-684 — held promo rows are staged, paginated, and expose real customer-limit fields', async () => {
  apiMocks.get.mockImplementation((url: string) => {
    if (url === '/api/v1/config') return Promise.resolve({ data: { data: { featureFlags: { promoRedemptionEnabled: false, abTestingEnabled: false } } } });
    if (url.endsWith('/overview')) return Promise.resolve({ data: { data: {
      totalSpendCentavos: 0, totalSignups: 0, totalRevenueCentavos: 0,
      aggregateCpaCentavos: 0, aggregateRoiPercent: 0, channelBreakdown: [],
    } } });
    if (url.endsWith('/promos')) return Promise.resolve({ data: { data: {
      rows: [{
        id: 'promo-1', code: 'WELCOME10', description: 'Launch code', discountType: 'percentage',
        discountValue: 10, maxDiscountCentavos: 5_000, minimumOrderCentavos: 50_000,
        usageLimitTotal: 100, usageLimitPerCustomer: 1, timesUsed: 0,
        validFrom: '2026-08-01T00:00:00.000Z', validUntil: null, active: true,
        createdAt: '2026-08-01T00:00:00.000Z',
      }],
      total: 25,
    } } });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><MarketingPage /></MemoryRouter></QueryClientProvider>);

  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Promo Codes' }), { button: 0, ctrlKey: false });
  expect(await screen.findByText('Promo redemption is on a launch hold.')).toBeVisible();
  expect(await screen.findByText('Staged · launch hold')).toBeVisible();
  expect(await screen.findByRole('button', { name: 'Page 2' })).toBeVisible();
  expect(screen.getByText((_, element) => (
    element?.tagName === 'P'
      && element.textContent?.replace(/\s+/g, ' ').trim() === 'Showing 1 to 20 of 25 results'
  ))).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Create New Promo/i }));
  const dialog = await screen.findByRole('dialog', { name: 'Create promo code' });
  expect(dialog).toBeVisible();
  expect(within(dialog).getByRole('alert')).toHaveTextContent(/staged record only/i);
  expect(screen.getByLabelText('Usage limit per customer')).toHaveValue(1);
  expect(screen.getByLabelText('Minimum order (PHP)')).toBeVisible();
  expect(screen.getByLabelText('Maximum discount (PHP)')).toBeVisible();
});
