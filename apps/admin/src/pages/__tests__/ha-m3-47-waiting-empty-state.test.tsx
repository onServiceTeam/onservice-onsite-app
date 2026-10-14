// HA-M3-47 (D38 Milestone 3): when the server answers with an empty queue,
// Waiting now says plainly that no quote request is open, and does not show
// an error or a stale row.
import React from 'react';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import { WaitingNowTab } from '@/components/marketplace/WaitingNowTab';
import { MARKETPLACE, openRequestsResponse, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-47: an empty queue from the server shows "No quote requests are open right now"', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/open-requests`) return openRequestsResponse([]);
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<WaitingNowTab />);

  expect(await screen.findByText('No quote requests are open right now')).toBeInTheDocument();
  expect(screen.queryByTestId('waiting-row')).not.toBeInTheDocument();
  expect(screen.queryByText('Waiting requests could not be loaded')).not.toBeInTheDocument();
});
