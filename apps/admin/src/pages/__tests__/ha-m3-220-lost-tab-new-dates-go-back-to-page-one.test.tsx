// HA-M3-220 (D38 Milestone 3, review gap): on Lost opportunities, changing
// the dates while on page 2 asks the server for page 1 of the new range.
// Asking for page 2 of a smaller result would show "No lost requests in this
// period" although there are some.
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

function lostRow(bookingId: string) {
  return {
    bookingId, reason: 'notified_none_viewed', closedBy: 'system', status: 'cancelled_by_admin',
    cancellationReason: null, categoryName: 'Plumbing', subcategoryName: 'Leak repair', barangay: null, city: 'Mandaue',
    createdAt: '2026-10-10T02:00:00.000Z', closedAt: '2026-10-13T02:00:00.000Z', rounds: 1, invited: 3, viewed: 0,
    quotes: 0, declinedQuotes: 0, budgetMinCentavos: null, budgetMaxCentavos: null, budgetUnknown: true,
    estimatedValueCentavos: null,
  };
}

it('HA-M3-220: changing the dates on page 2 of Lost opportunities requests page 1', async () => {
  apiMocks.get.mockImplementation(async (url: string, init?: { params?: { page?: number } }) => {
    if (url !== `${MARKETPLACE}/lost-opportunities`) throw new Error(`Unexpected GET ${url}`);
    const page = init?.params?.page ?? 1;
    return {
      data: {
        success: true,
        data: [lostRow(`booking-page-${page}`)],
        meta: { summary: null, total: 60, page, pageSize: 25 },
      },
    };
  });

  renderWithProviders(<LostOpportunitiesTab />);
  expect(await screen.findByText('Page 1 of 3 (60 total)')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2 of 3 (60 total)')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('From (Manila date)'), { target: { value: '2026-10-01' } });

  await waitFor(() => expect(apiMocks.get).toHaveBeenLastCalledWith(`${MARKETPLACE}/lost-opportunities`, {
    params: { from: '2026-10-01', to: undefined, reason: undefined, page: 1, pageSize: 25 },
  }));
});
