// HA-M3-51 (D38 Milestone 3): the Lost opportunities date range (Manila
// calendar days) and reason filter are sent to the server as from, to and
// reason. The first load sends no dates, so the server's default (the last 30
// days) applies. (Going back to page 1 when the dates change, from a later
// page, is HA-M3-220; this test never leaves page 1.)
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { LostOpportunitiesTab } from '@/components/marketplace/LostOpportunitiesTab';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

it('HA-M3-51: choosing dates and a reason on Lost opportunities requests exactly those from, to and reason values', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `${MARKETPLACE}/lost-opportunities`) {
      return { data: { success: true, data: [], meta: { summary: null, total: 0, page: 1, pageSize: 25 } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  renderWithProviders(<LostOpportunitiesTab />);

  expect(await screen.findByText('No lost requests in this period')).toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenLastCalledWith(`${MARKETPLACE}/lost-opportunities`, {
    params: { from: undefined, to: undefined, reason: undefined, page: 1, pageSize: 25 },
  });

  fireEvent.change(screen.getByLabelText('From (Manila date)'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('To (Manila date)'), { target: { value: '2026-10-07' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'customer_cancelled_waiting' } });

  await waitFor(() => expect(apiMocks.get).toHaveBeenLastCalledWith(`${MARKETPLACE}/lost-opportunities`, {
    params: { from: '2026-10-01', to: '2026-10-07', reason: 'customer_cancelled_waiting', page: 1, pageSize: 25 },
  }));
  expect(
    await screen.findByText('No closed request without a booking matches this reason in the chosen dates.'),
  ).toBeInTheDocument();
});
