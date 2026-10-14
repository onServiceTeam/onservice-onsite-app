import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

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
// Real router, so the audit-log link (/marketing?tab=banners&promotionId=...) is read from the URL.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import MarketingPage from '../MarketingPage';

const DAY_MS = 24 * 60 * 60 * 1000;
const PROMOTION_ID = '11111111-1111-4111-8111-111111111111';

interface BannerOverrides {
  title: string;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
}

function bannerRow(overrides: BannerOverrides): Record<string, unknown> {
  return {
    id: PROMOTION_ID,
    subtitle: null,
    imageUrl: null,
    badge: null,
    ctaText: null,
    ctaLink: null,
    targetAudience: 'all',
    displayOrder: 0,
    createdAt: new Date(Date.now() - 60 * DAY_MS).toISOString(),
    ...overrides,
  };
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function serveBanner(overrides: BannerOverrides): void {
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
      success: true,
      data: [bannerRow(overrides)],
      meta: { page: 1, pageSize: 20, total: 1 },
    } });
    if (url === `/api/v1/promotions/${PROMOTION_ID}`) return Promise.resolve({ data: {
      success: true,
      data: bannerRow(overrides),
    } });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

function renderMarketing(initialEntry: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}><MarketingPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function renderBannerRow(overrides: BannerOverrides): Promise<HTMLElement> {
  serveBanner(overrides);
  renderMarketing('/marketing');

  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Home Banners' }), { button: 0, ctrlKey: false });
  const title = await screen.findByText(overrides.title);
  const row = title.closest('tr');
  if (!row) throw new Error('Banner row was not rendered as a table row');
  return row;
}

beforeEach(() => {
  apiMocks.get.mockReset();
});

it('Bug R-ADM-18 — a switched-off banner whose end date has passed reads Ended, not Draft / paused', async () => {
  const row = await renderBannerRow({
    title: 'Ended while paused',
    isActive: false,
    startDate: daysFromNow(-30),
    endDate: daysFromNow(-2),
  });

  expect(within(row).getByText('Ended')).toBeVisible();
  expect(within(row).queryByText('Draft / paused')).not.toBeInTheDocument();
});

it('Bug R-ADM-18 — Publish is turned off for a switched-off banner whose end date has passed', async () => {
  const row = await renderBannerRow({
    title: 'Ended draft',
    isActive: false,
    startDate: daysFromNow(-30),
    endDate: daysFromNow(-2),
  });

  expect(within(row).getByRole('button', { name: 'Publish' })).toBeDisabled();
});

it('Bug R-ADM-18 — the audit evidence card reads Ended for a switched-off banner whose end date has passed', async () => {
  serveBanner({
    title: 'Ended while paused, opened from the audit log',
    isActive: false,
    startDate: daysFromNow(-30),
    endDate: daysFromNow(-2),
  });
  renderMarketing(`/marketing?tab=banners&promotionId=${PROMOTION_ID}`);

  expect(await screen.findByText('Selected audit evidence')).toBeVisible();
  const label = screen.getAllByText('Delivery status').find((element) => element.tagName === 'DT');
  if (!label) throw new Error('The evidence card did not render a Delivery status field');
  const value = label.nextElementSibling;
  if (!value) throw new Error('The evidence card Delivery status field has no value');
  expect(value).toHaveTextContent(/^Ended$/);
});

it('Bug R-ADM-18 — a switched-off banner whose end date has not passed still reads Draft / paused', async () => {
  const row = await renderBannerRow({
    title: 'Paused and still running',
    isActive: false,
    startDate: daysFromNow(-30),
    endDate: daysFromNow(5),
  });

  expect(within(row).getByText('Draft / paused')).toBeVisible();
  expect(within(row).queryByText('Ended')).not.toBeInTheDocument();
});

it('Bug R-ADM-18 — Publish stays on for a switched-off banner whose end date has not passed', async () => {
  const row = await renderBannerRow({
    title: 'Paused and ready to publish',
    isActive: false,
    startDate: daysFromNow(-30),
    endDate: daysFromNow(5),
  });

  expect(within(row).getByRole('button', { name: 'Publish' })).toBeEnabled();
});

it('Bug R-ADM-18 — a switched-on banner whose end date has passed still reads Ended', async () => {
  const row = await renderBannerRow({
    title: 'Ended while live',
    isActive: true,
    startDate: daysFromNow(-30),
    endDate: daysFromNow(-2),
  });

  expect(within(row).getByText('Ended')).toBeVisible();
});

it('Bug R-ADM-18 — a switched-on banner that starts later still reads Scheduled', async () => {
  const row = await renderBannerRow({
    title: 'Starts next week',
    isActive: true,
    startDate: daysFromNow(7),
    endDate: daysFromNow(14),
  });

  expect(within(row).getByText('Scheduled')).toBeVisible();
});

it('Bug R-ADM-18 — a switched-off banner that starts later still reads Draft / paused', async () => {
  const row = await renderBannerRow({
    title: 'Draft for next week',
    isActive: false,
    startDate: daysFromNow(7),
    endDate: daysFromNow(14),
  });

  expect(within(row).getByText('Draft / paused')).toBeVisible();
});
