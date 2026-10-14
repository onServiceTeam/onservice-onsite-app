// HA-M3-223 (D38 Milestone 3, split from HA-M3-50): above the lost requests,
// the summary says how many closed without a booking and their estimated
// value from customer budgets (meta.summary), and how many had no budget and
// are left out of the estimate.
import React from 'react';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { LostOpportunitiesTab } from '@/components/marketplace/LostOpportunitiesTab';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-223: the Lost summary states the total, the estimated value and how many had no budget', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/lost-opportunities`) {
      return {
        data: {
          success: true,
          data: [],
          meta: {
            summary: { total: 7, byReason: { notified_none_viewed: 7 }, estimatedValueCentavos: 1_234_500, withoutBudget: 3 },
            total: 7, page: 1, pageSize: 25, from: '2026-09-15', to: '2026-10-14',
          },
        },
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<LostOpportunitiesTab />);

  expect(
    await screen.findByText('7 requests closed without a booking. Estimated value from customer budgets: ₱12,345.00.'),
  ).toBeInTheDocument();
  expect(screen.getByText('3 requests had no budget and are not counted in the estimate.')).toBeInTheDocument();
});
