import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import MarketingPage from '../MarketingPage';

it('Bug UX-688 — company staff can review customer-home delivery truth and create a banner as a separately publishable draft', async () => {
  apiMocks.get.mockImplementation((url: string) => {
    if (url.endsWith('/overview')) return Promise.resolve({ data: { data: {
      totalSpendCentavos: 0,
      totalSignups: 0,
      totalRevenueCentavos: 0,
      aggregateCpaCentavos: 0,
      aggregateRoiPercent: 0,
      channelBreakdown: [],
    } } });
    if (url === '/api/v1/promotions') return Promise.resolve({ data: {
      data: [{
        id: 'banner-1',
        title: 'Book with confidence',
        subtitle: 'Vetted local providers.',
        imageUrl: null,
        badge: 'TRUSTED',
        ctaText: 'Browse services',
        ctaLink: '/customer/search',
        targetAudience: 'all',
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: null,
        isActive: false,
        displayOrder: 0,
        createdAt: '2026-08-31T00:00:00.000Z',
      }],
      meta: { page: 1, pageSize: 20, total: 1 },
    } });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  apiMocks.post.mockResolvedValue({ data: { data: { id: 'banner-2' } } });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><MarketingPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Home Banners' }), { button: 0, ctrlKey: false });
  expect(await screen.findByText('Book with confidence')).toBeVisible();
  expect(screen.getByText('Draft / paused')).toBeVisible();
  expect(screen.getByText(/Images are not rendered by the current app/i)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: /Create draft banner/i }));
  const dialog = await screen.findByRole('dialog', { name: 'Create draft home banner' });
  expect(within(dialog).getByText(/only segment currently connected/i)).toBeVisible();
  expect(within(dialog).getByText('Customer preview')).toBeVisible();
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Cebu launch' } });
  fireEvent.change(within(dialog).getByLabelText('CTA label'), { target: { value: 'Browse services' } });
  fireEvent.change(within(dialog).getByLabelText('CTA destination'), { target: { value: '/customer/search' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
    '/api/v1/promotions',
    expect.objectContaining({
      title: 'Cebu launch',
      targetAudience: 'all',
      isActive: false,
      ctaLink: '/customer/search',
    }),
  ));
});
