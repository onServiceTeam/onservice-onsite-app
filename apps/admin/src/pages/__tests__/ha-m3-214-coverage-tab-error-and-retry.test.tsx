// HA-M3-214 (D38 Milestone 3, review gap): when the coverage grid cannot be
// loaded, or the answer is not a grid, the Coverage tab says "Coverage could
// not be loaded" with the reason, never "No active service areas", and Retry
// asks again and shows the grid.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { CoverageTab } from '@/components/marketplace/CoverageTab';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-214: an unreadable Coverage answer shows an error with Retry, and Retry loads the grid', async () => {
  let calls = 0;
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/coverage`) throw new Error(`Unexpected GET ${url}`);
    calls += 1;
    if (calls === 1) return { data: { success: true, data: { areas: [] } } };
    return {
      data: {
        success: true,
        data: {
          threshold: 3,
          areas: [{ id: 'area-1', name: 'Cebu City', status: 'active' }],
          categories: [{ id: 'category-1', name: 'Aircon' }],
          cells: [{ areaId: 'area-1', categoryId: 'category-1', approvedProviders: 5, responsiveProviders: 4, requests30d: 12, belowThreshold: false }],
        },
      },
    };
  });

  renderWithProviders(<CoverageTab />);

  expect(await screen.findByText('Coverage could not be loaded')).toBeInTheDocument();
  expect(screen.getByText('The coverage response could not be read.')).toBeInTheDocument();
  expect(screen.queryByText('No active service areas')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByTestId('coverage-cell')).toHaveTextContent('4 of 5');
  expect(calls).toBe(2);
});
