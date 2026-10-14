// HA-M3-217 (D38 Milestone 3, review gap): when no service area is active,
// soft-launch or recruiting, the Coverage tab says "No active service areas"
// and shows no grid and no error.
import React from 'react';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { CoverageTab } from '@/components/marketplace/CoverageTab';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-217: a Coverage answer with no active area shows "No active service areas"', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/coverage`) {
      return {
        data: { success: true, data: { threshold: 3, areas: [], categories: [{ id: 'category-1', name: 'Aircon' }], cells: [] } },
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<CoverageTab />);

  expect(await screen.findByText('No active service areas')).toBeInTheDocument();
  expect(screen.queryByTestId('coverage-cell')).not.toBeInTheDocument();
  expect(screen.queryByText('Coverage could not be loaded')).not.toBeInTheDocument();
});
