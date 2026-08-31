import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it } from 'vitest';

import { BookingActions } from '../BookingDetailPage';

it('Bug UX-714 — Booking 360 disables invalid destructive actions for a settled booking', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <BookingActions
        bookingId="11111111-1111-4111-8111-111111111111"
        bookingStatus="paid_out"
        escrowStatus="released"
      />
    </QueryClientProvider>,
  );

  expect(screen.getByRole('button', { name: 'Manual release' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Refund' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reassign' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Force complete' })).toBeDisabled();
  expect(screen.getByText(/Completed money states use dispute or settlement workflows/i)).toBeVisible();
});
