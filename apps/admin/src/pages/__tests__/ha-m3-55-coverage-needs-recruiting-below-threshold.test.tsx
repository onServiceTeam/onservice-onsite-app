// HA-M3-55 (D38 Milestone 3): /marketplace?tab=coverage crosses service
// areas with categories. A cell whose responsive providers are under the
// threshold (belowThreshold from the server, setting 3) is red and says
// "Needs recruiting" in words; a cell at or over it does not. Source: GET
// /api/v1/admin/marketplace-health/coverage.
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

it('HA-M3-55: the Coverage grid marks only the cells under the threshold as "Needs recruiting"', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/coverage`) {
      return {
        data: {
          success: true,
          data: {
            threshold: 3,
            areas: [{ id: 'area-cebu', name: 'Cebu City', status: 'active' }],
            categories: [{ id: 'cat-aircon', name: 'Aircon' }, { id: 'cat-plumbing', name: 'Plumbing' }],
            cells: [
              { areaId: 'area-cebu', categoryId: 'cat-aircon', approvedProviders: 5, responsiveProviders: 2, requests30d: 9, belowThreshold: true },
              { areaId: 'area-cebu', categoryId: 'cat-plumbing', approvedProviders: 4, responsiveProviders: 3, requests30d: 1, belowThreshold: false },
            ],
          },
        },
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplacePage />, { route: '/marketplace?tab=coverage' });

  const cells = await screen.findAllByTestId('coverage-cell');
  const aircon = cells.find((cell) => cell.getAttribute('data-category') === 'Aircon')!;
  const plumbing = cells.find((cell) => cell.getAttribute('data-category') === 'Plumbing')!;
  expect(within(aircon).getByText('2 of 5')).toBeInTheDocument();
  expect(within(aircon).getByText('9 requests in 30 days')).toBeInTheDocument();
  expect(within(aircon).getByText('Needs recruiting')).toBeInTheDocument();
  expect(aircon).toHaveAttribute('data-below-threshold', 'true');
  expect(within(plumbing).getByText('3 of 4')).toBeInTheDocument();
  expect(within(plumbing).queryByText('Needs recruiting')).not.toBeInTheDocument();
  expect(plumbing).toHaveAttribute('data-below-threshold', 'false');
  expect(screen.getByText(/Red cells have fewer than 3 responsive providers/)).toBeInTheDocument();
});
