// HA-M3-215 (D38 Milestone 3, review gap): when the server answers with no
// group at all for the period, Response times says "No quote requests in this
// period" and shows no table and no error.
import React from 'react';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { ResponseTimesTab } from '@/components/marketplace/ResponseTimesTab';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-215: an empty Response times answer shows "No quote requests in this period"', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/response-times`) {
      return { data: { success: true, data: [], meta: { overall: null, from: '2026-09-15', to: '2026-10-14', groupBy: 'category' } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<ResponseTimesTab />);

  expect(await screen.findByText('No quote requests in this period')).toBeInTheDocument();
  expect(screen.queryByTestId('response-time-row')).not.toBeInTheDocument();
  expect(screen.queryByText('Response times could not be loaded')).not.toBeInTheDocument();
});
