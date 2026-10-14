// HA-M3-225 (D38 Milestone 3, split from HA-M3-50): the Marketplace tab lives
// in the URL, so /marketplace?tab=lost opens with "Lost opportunities"
// selected.
import React from 'react';
import { screen } from '@testing-library/react';
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

it('HA-M3-225: /marketplace?tab=lost opens with the Lost opportunities tab selected', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/lost-opportunities`) {
      return { data: { success: true, data: [], meta: { summary: null, total: 0, page: 1, pageSize: 25 } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<MarketplacePage />, { route: '/marketplace?tab=lost' });

  expect(await screen.findByText('No lost requests in this period')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Lost opportunities' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'Waiting now' })).toHaveAttribute('aria-selected', 'false');
});
