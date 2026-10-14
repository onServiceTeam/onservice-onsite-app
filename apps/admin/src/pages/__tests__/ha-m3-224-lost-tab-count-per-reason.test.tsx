// HA-M3-224 (D38 Milestone 3, split from HA-M3-50): the Lost summary lists
// every reason with its count (meta.summary.byReason), and a reason the
// server did not count shows 0 rather than being left out.
import React from 'react';
import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { LostOpportunitiesTab } from '@/components/marketplace/LostOpportunitiesTab';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-224: the Lost summary shows a count for each of the six reasons, 0 where none', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/lost-opportunities`) {
      return {
        data: {
          success: true,
          data: [],
          meta: {
            summary: {
              total: 5,
              byReason: { notified_none_viewed: 3, customer_cancelled_waiting: 2 },
              estimatedValueCentavos: 0,
              withoutBudget: 0,
            },
            total: 5, page: 1, pageSize: 25,
          },
        },
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<LostOpportunitiesTab />);

  const reasons = await screen.findByRole('list', { name: 'Lost requests by reason' });
  expect(within(reasons).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'No eligible provider: 0',
    'Providers notified, none opened it: 3',
    'Opened, but nobody sent a quote: 0',
    'Customer declined the quotes: 0',
    'Customer cancelled while waiting: 2',
    'Closed with no booking: 0',
  ]);
});
