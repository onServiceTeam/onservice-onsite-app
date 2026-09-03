import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it } from 'vitest';

import { BookingActions } from '../BookingDetailPage';

it('Bug OPS-296 — Booking 360 permits release of the provider remainder after a partial refund', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BookingActions
        bookingId="11111111-1111-4111-8111-111111111111"
        bookingStatus="confirmed"
        escrowStatus="partially_refunded"
      />
    </QueryClientProvider>,
  );

  expect(screen.getByRole('button', { name: 'Manual release' })).toBeEnabled();
});
