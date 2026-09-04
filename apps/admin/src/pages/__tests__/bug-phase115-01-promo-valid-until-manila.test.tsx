// BUG-PHASE115-01 — admin MarketingPage promo `validUntil` was
// stamped with `T23:59:59Z` (UTC midnight - 1 second). For a Manila
// admin entering "Valid until 2026-05-31", the suffix made the promo
// expire at 2026-05-31T23:59:59 UTC = 2026-06-01T07:59:59+08:00
// Manila — effectively giving the promo 8 extra hours of validity
// into the morning of the following Manila day. Customers booking
// before 8 AM on June 1 could still apply a "May only" promo. Same
// Manila-tz pattern as Phase 105 (calendar) and Phase 113 (recurring
// cron), but on the WRITE side: this is the value the API persists,
// so the leak is durable rather than just cosmetic.
//
// Two call sites — CreatePromoDialog and EditPromoDialog — both
// fixed. Anchoring to +08:00 makes "valid until day X" mean what the
// admin typed: midnight-end-of-day Manila.

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

it('Bug PHASE115-01 - create and edit preserve the Manila end-of-day instant', async () => {
  const promo = {
    id: 'promo-1', code: 'WELCOME10', description: 'Launch code', discountType: 'percentage' as const,
    discountValue: 10, maxDiscountCentavos: 5_000, minimumOrderCentavos: 50_000,
    usageLimitTotal: 100, usageLimitPerCustomer: 1, timesUsed: 0,
    validFrom: '2026-08-01T00:00:00.000Z', validUntil: '2026-05-31T15:59:59.000Z', active: true,
    createdAt: '2026-08-01T00:00:00.000Z',
  };
  apiMocks.get.mockImplementation((url: string) => {
    if (url === '/api/v1/config') return Promise.resolve({ data: { data: { featureFlags: { promoRedemptionEnabled: false, abTestingEnabled: false } } } });
    if (url.endsWith('/overview')) return Promise.resolve({ data: { data: {
      totalSpendCentavos: 0, totalSignups: 0, totalRevenueCentavos: 0,
      aggregateCpaCentavos: 0, aggregateRoiPercent: 0, channelBreakdown: [],
    } } });
    if (url.endsWith('/promos')) return Promise.resolve({ data: { data: { rows: [promo], total: 1 } } });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  apiMocks.post.mockResolvedValue({ data: { data: promo } });
  apiMocks.patch.mockResolvedValue({ data: { data: promo } });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><MarketingPage /></MemoryRouter></QueryClientProvider>);

  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Promo Codes' }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole('button', { name: /Create New Promo/i }));
  const createDialog = await screen.findByRole('dialog', { name: 'Create promo code' });
  fireEvent.change(within(createDialog).getByLabelText('Code'), { target: { value: 'welcome10' } });
  fireEvent.change(within(createDialog).getByLabelText(/Percent/), { target: { value: '10' } });
  fireEvent.change(within(createDialog).getByLabelText('Valid until'), { target: { value: '2026-05-31' } });
  fireEvent.click(within(createDialog).getByRole('button', { name: 'Create' }));

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
    '/api/v1/admin/marketing/promos',
    expect.objectContaining({ code: 'WELCOME10', validUntil: '2026-05-31T23:59:59+08:00' }),
  ));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create promo code' })).not.toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const editDialog = await screen.findByRole('dialog', { name: 'Edit WELCOME10' });
  fireEvent.change(within(editDialog).getByLabelText('Valid until'), { target: { value: '2026-06-01' } });
  fireEvent.click(within(editDialog).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(apiMocks.patch).toHaveBeenCalledWith(
    '/api/v1/admin/marketing/promos/promo-1',
    expect.objectContaining({ validUntil: '2026-06-01T23:59:59+08:00' }),
  ));
});
