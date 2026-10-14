// HA-M2-222 (Milestone 2, P6-M2): Booking 360 Quotes tab shows the time the
// provider offered (earliest date plus window), what could change the price,
// and the request round, from GET /api/v1/admin/bookings/:id/quotes
// (bookingService.getBookingQuotes). A quote sent before slots existed is
// HA-M2-239.
import React from 'react';
import { render, screen } from '@testing-library/react';
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
    providerRating: 4.8,
    quotedPrice: 180000,
    description: 'Clean and re-gas one split-type aircon.',
    status: 'submitted',
    laborAmount: 180000,
    materialsAmount: 0,
    estimatedDays: null,
    notes: '',
    expiresAt: '2026-10-16T01:00:00.000Z',
    createdAt: '2026-10-14T01:00:00.000Z',
    lineItems: [],
    couldChangeIf: null,
    earliestDate: null,
    earliestTimeWindow: null,
    acceptedCustomerBudget: false,
    round: 1,
    ...overrides,
  };
}

it("HA-M2-222: the Quotes tab shows each quote's earliest date and window, what could change, and its round", async () => {
  get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/bookings/booking-1/quotes') {
      return {
        data: {
          success: true,
          data: {
            quotes: [
              quote({
                earliestDate: '2026-10-15',
                earliestTimeWindow: 'morning',
                couldChangeIf: 'The unit needs a new capacitor.',
                round: 2,
              }),
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

  const slot = await screen.findByText(/Morning \(8 AM to 12 PM\)/);
  const expectedDate = new Date('2026-10-15T12:00:00+08:00').toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  expect(slot).toHaveTextContent(`${expectedDate}, Morning (8 AM to 12 PM)`);
  expect(screen.getByText('The unit needs a new capacitor.')).toBeInTheDocument();
  expect(screen.getByText('Round 2')).toBeInTheDocument();
});
