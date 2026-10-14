// HA-M2-229 (Milestone 2, P6-M2): the Quotes tab shows the customer's decline
// reason (a fixed reason code, never the customer's free-text note) only when
// the admin quotes endpoint sends declineReason. The admin route asks
// getBookingQuotes for includeDeclineReason (booking-admin.routes.ts), which
// sets it on declined quotes; quotes without one (and older API builds that
// omit the field) show nothing.
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { QuotesTab } from '../BookingDetailPage';

function quote(overrides: Record<string, unknown>) {
  return {
    id: 'quote-1',
    providerId: 'provider-1',
    providerName: 'Ramon Cruz',
    providerRating: null,
    quotedPrice: 250000,
    description: 'Fix the leaking kitchen sink trap.',
    status: 'declined',
    laborAmount: 250000,
    materialsAmount: 0,
    estimatedDays: null,
    notes: '',
    expiresAt: '2026-10-16T01:00:00.000Z',
    createdAt: '2026-10-14T01:00:00.000Z',
    lineItems: [],
    couldChangeIf: null,
    earliestDate: '2026-10-15',
    earliestTimeWindow: 'afternoon',
    acceptedCustomerBudget: false,
    round: 1,
    ...overrides,
  };
}

it("HA-M2-229: the Quotes tab shows the customer's decline reason only when the API sends one", async () => {
  get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/bookings/booking-1/quotes') {
      return {
        data: {
          success: true,
          data: {
            quotes: [
              quote({ declineReason: 'too_expensive' }),
              quote({ id: 'quote-2', providerName: 'Lito Ramos' }),
            ],
            changeOrders: [],
          },
        },
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <QuotesTab bookingId="booking-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const declinedCard = (await screen.findByText('Ramon Cruz')).closest('div.rounded-lg') as HTMLElement;
  expect(within(declinedCard).getByText("Customer's decline reason")).toBeInTheDocument();
  expect(within(declinedCard).getByText('Price too high')).toBeInTheDocument();

  const otherCard = screen.getByText('Lito Ramos').closest('div.rounded-lg') as HTMLElement;
  expect(within(otherCard).queryByText(/decline reason/i)).not.toBeInTheDocument();
  expect(within(otherCard).queryByText('Price too high')).not.toBeInTheDocument();
});
