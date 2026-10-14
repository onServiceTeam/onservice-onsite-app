// HA-M2-239 (Milestone 2, P6-M2 fixer; split out of HA-M2-222): a quote sent
// before providers chose a date and time window has no earliestDate. The
// Quotes tab says no date was offered instead of inventing a time, and shows
// no "Could change if" row it does not have.
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

it('HA-M2-239: a quote sent before time slots existed says no date was offered', async () => {
  get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/bookings/booking-1/quotes') {
      return {
        data: {
          success: true,
          data: {
            quotes: [{
              id: 'quote-legacy',
              providerId: 'provider-2',
              providerName: 'Lito Ramos',
              providerRating: null,
              quotedPrice: 150000,
              description: 'Replace the bathroom faucet.',
              status: 'submitted',
              laborAmount: 150000,
              materialsAmount: 0,
              estimatedDays: null,
              notes: '',
              expiresAt: '2026-10-16T01:00:00.000Z',
              createdAt: '2026-10-01T01:00:00.000Z',
              lineItems: [],
              couldChangeIf: null,
              earliestDate: null,
              earliestTimeWindow: null,
              acceptedCustomerBudget: false,
              round: 1,
            }],
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

  const card = (await screen.findByText('Lito Ramos')).closest('div.rounded-lg') as HTMLElement;
  expect(within(card).getByText(
    'No date offered. This quote was sent before providers chose a date and time window.',
  )).toBeInTheDocument();
  expect(within(card).queryByText(/Morning|Afternoon|Evening|As soon as possible/)).not.toBeInTheDocument();
  expect(within(card).queryByText('Could change if')).not.toBeInTheDocument();
});
