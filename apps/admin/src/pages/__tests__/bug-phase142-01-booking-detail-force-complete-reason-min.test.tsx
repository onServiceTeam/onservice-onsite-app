// BUG-PHASE142-01 — BookingDetailPage's super-admin actions panel
// gated all five mutations (release / refund / reassign / cancel /
// force-complete) behind a single `reasonOk = reason.trim().length >= 10`
// check. That works for 4 of the 5 actions (release/refund/cancel
// require 10 chars server-side; reassign requires 5).
//
// But the server's force-complete validator is stricter:
//   booking-admin.service.ts:984 → requireReason(reason, 20)
//
// So an admin typing a 10-19 character reason on the force-complete
// dialog passed the client check, hit the server, and got a generic
// 400 with no clear message about the 20-char floor. Same client/server
// validation-mismatch pattern as BUG-PHASE77-02 (cancel was 5/10
// pre-fix). Now: separate `reasonOkForce` gate that matches the
// server's 20-char floor + label hint that explains the higher bar.
//
// Test strategy: render the actual BookingActions panel, open the
// force-complete form, and exercise the reason field without confirming the
// destructive action. Server-side minimum-length behavior is covered by the
// API booking-admin tests.

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { it, expect } from 'vitest';
import { BookingActions } from '../BookingDetailPage';

it('Bug PHASE142-01 — force-complete stays disabled below 20 characters and enables at 20', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <BookingActions
        bookingId="11111111-1111-4111-8111-111111111111"
        bookingStatus="in_progress"
        escrowStatus="held"
      />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Force complete' }));
  const reason = screen.getByRole('textbox', { name: 'Booking action reason' });
  const confirm = screen.getByRole('button', { name: 'Confirm force-complete' });

  expect(screen.getByText(/Reason \(min 20 characters/i)).toBeVisible();
  fireEvent.change(reason, { target: { value: '1234567890123456789' } });
  expect(confirm).toBeDisabled();

  fireEvent.change(reason, {
    target: { value: 'Customer confirmation was not obtained after support review.' },
  });
  expect(confirm).toBeEnabled();
});
