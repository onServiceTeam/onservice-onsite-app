// HA-M3-216 (D38 Milestone 3, review gap): when no provider received a
// request in the period, the Providers tab says so ("No provider received a
// request in this period") and shows no table and no error.
import React from 'react';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { ProvidersResponsivenessTab } from '@/components/marketplace/ProvidersResponsivenessTab';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-216: an empty Providers answer shows "No provider received a request in this period"', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/providers`) {
      return { data: { success: true, data: [], meta: { total: 0, page: 1, pageSize: 25 } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<ProvidersResponsivenessTab />);

  expect(await screen.findByText('No provider received a request in this period')).toBeInTheDocument();
  expect(screen.queryByTestId('provider-row')).not.toBeInTheDocument();
  expect(screen.queryByText('Provider responsiveness could not be loaded')).not.toBeInTheDocument();
});
