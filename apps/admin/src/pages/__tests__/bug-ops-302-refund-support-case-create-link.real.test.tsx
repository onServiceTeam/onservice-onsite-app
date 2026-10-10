import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BookingActions } from '../BookingDetailPage';

it('Bug OPS-302 — the refund workflow opens a booking-linked case creation form for the customer', async () => {
  const bookingId = 'booking-302';
  apiMocks.get.mockResolvedValue({ data: { data: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['admin-booking-refund-support-cases', bookingId], []);

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BookingActions
          bookingId={bookingId}
          customerId="customer-302"
          customerName="Ana Reyes"
          bookingStatus="confirmed"
          escrowStatus="held"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Refund' }));

  expect(await screen.findByText('Create a customer support case first')).toHaveAttribute(
    'to',
    '/support-tickets?bookingId=booking-302&userId=customer-302&userName=Ana+Reyes&userRole=customer&new=1',
  );
});
