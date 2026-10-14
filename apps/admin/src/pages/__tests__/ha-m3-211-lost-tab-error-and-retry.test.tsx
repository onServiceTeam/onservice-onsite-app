// HA-M3-211 (D38 Milestone 3, review gap): when the lost requests cannot be
// loaded, Lost opportunities says "Lost requests could not be loaded" with the
// reason, never "No lost requests in this period", and Retry asks again and
// shows the rows.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { LostOpportunitiesTab } from '@/components/marketplace/LostOpportunitiesTab';
import { MARKETPLACE, renderWithProviders } from '@/components/marketplace/__tests__/marketplace-test-fixtures';

const lostRow = {
  bookingId: 'booking-211', reason: 'notified_none_viewed', closedBy: 'system', status: 'cancelled_by_admin',
  cancellationReason: null, categoryName: 'Plumbing', subcategoryName: 'Leak repair', barangay: null, city: 'Mandaue',
  createdAt: '2026-10-10T02:00:00.000Z', closedAt: '2026-10-13T02:00:00.000Z', rounds: 1, invited: 3, viewed: 0,
  quotes: 0, declinedQuotes: 0, budgetMinCentavos: null, budgetMaxCentavos: null, budgetUnknown: true,
  estimatedValueCentavos: null,
};

it('HA-M3-211: a failed Lost opportunities load shows an error with Retry, and Retry loads the rows', async () => {
  let calls = 0;
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url !== `${MARKETPLACE}/lost-opportunities`) throw new Error(`Unexpected GET ${url}`);
    calls += 1;
    if (calls === 1) throw new Error('Database timeout');
    return { data: { success: true, data: [lostRow], meta: { summary: null, total: 1, page: 1, pageSize: 25 } } };
  });

  renderWithProviders(<LostOpportunitiesTab />);

  expect(await screen.findByText('Lost requests could not be loaded')).toBeInTheDocument();
  expect(screen.getByText('Database timeout')).toBeInTheDocument();
  expect(screen.queryByText('No lost requests in this period')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByTestId('lost-row')).toBeInTheDocument();
  expect(calls).toBe(2);
});
