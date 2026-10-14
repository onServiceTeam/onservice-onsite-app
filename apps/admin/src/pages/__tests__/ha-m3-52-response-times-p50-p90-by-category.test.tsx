// HA-M3-52 (D38 Milestone 3): /marketplace?tab=response-times shows, for the
// whole period, the median (p50) and p90 time to the first quote, the share
// answered within 30 minutes and the request counts, then one row per
// category. A group with no quote at all says "No quotes yet" instead of 0.
// Source: GET /api/v1/admin/marketplace-health/response-times (groupBy
// category by default).
import React from 'react';
import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import MarketplacePage from '../MarketplacePage';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-52: the Response times tab shows the overall p50, p90 and within-30-minutes share and a row per category', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/response-times`) {
      return {
        data: {
          success: true,
          data: [
            { categoryName: 'Aircon', requests: 4, responded: 3, noResponse: 1, p50Minutes: 12.5, p90Minutes: 75, within30Pct: 50 },
            { categoryName: 'Plumbing', requests: 2, responded: 0, noResponse: 2, p50Minutes: null, p90Minutes: null, within30Pct: 0 },
          ],
          meta: {
            overall: { requests: 6, responded: 3, noResponse: 3, p50Minutes: 12.5, p90Minutes: 75, within30Pct: 33.3 },
            from: '2026-09-15',
            to: '2026-10-14',
            groupBy: 'category',
          },
        },
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplacePage />, { route: '/marketplace?tab=response-times' });

  const overall = await screen.findByLabelText('All requests in the period');
  expect(within(overall).getByText('Median first quote (p50)').nextSibling).toHaveTextContent(/^12\.5 min$/);
  expect(within(overall).getByText('9 in 10 answered within (p90)').nextSibling).toHaveTextContent(/^1 h 15 min$/);
  expect(within(overall).getByText('Answered within 30 min').nextSibling).toHaveTextContent(/^33\.3%$/);
  expect(within(overall).getByText('No quote').nextSibling).toHaveTextContent(/^3$/);

  const rows = screen.getAllByTestId('response-time-row');
  expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual(['Aircon', 'Plumbing']);
  expect(within(rows[0]!).getByText('12.5 min')).toBeInTheDocument();
  expect(within(rows[0]!).getByText('50%')).toBeInTheDocument();
  expect(within(rows[1]!).getAllByText('No quotes yet')).toHaveLength(2);
  expect(apiMocks.get).toHaveBeenCalledWith(`${MARKETPLACE}/response-times`, {
    params: { from: undefined, to: undefined, groupBy: 'category' },
  });
});
