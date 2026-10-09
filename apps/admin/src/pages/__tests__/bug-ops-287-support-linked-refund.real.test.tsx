import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BookingActions } from '../BookingDetailPage';

it('Bug OPS-287 — Booking 360 requires an active linked support case for a refund', async () => {
  const bookingId = '11111111-1111-4111-8111-111111111111';
  const supportTicketId = '22222222-2222-4222-8222-222222222222';
  const idempotencyKey = '33333333-3333-4333-8333-333333333333';
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => idempotencyKey,
  });
  apiMocks.get.mockResolvedValue({
    data: {
      data: [{
        id: supportTicketId,
        ticket_number: 'SUP-287',
        subject: 'Customer reported incomplete work',
        status: 'open',
      }],
    },
  });
  apiMocks.post.mockResolvedValue({
    data: {
      success: true,
      data: {
        customerWalletCredited: false,
        idempotentReplay: false,
        paymentProcessingQueued: false,
        paymentProcessingStatus: 'processed',
      },
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <BookingActions bookingId={bookingId} bookingStatus="confirmed" escrowStatus="held" />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
  fireEvent.change(screen.getByLabelText('Refund amount (PHP)'), { target: { value: '125.50' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Booking action reason' }), {
    target: { value: 'Support verified the incomplete portion of the work.' },
  });
  expect(screen.getByRole('button', { name: /Confirm refund/ })).toBeDisabled();

  await screen.findByRole('option', { name: 'SUP-287 · Customer reported incomplete work' });
  const supportCase = screen.getByLabelText('Active linked support case (required)');
  fireEvent.change(supportCase, { target: { value: supportTicketId } });
  expect(screen.getByLabelText('Refund amount (PHP)')).toHaveValue(125.5);
  expect(screen.getByRole('textbox', { name: 'Booking action reason' })).toHaveValue(
    'Support verified the incomplete portion of the work.',
  );
  expect(supportCase).toHaveValue(supportTicketId);
  const confirmRefund = screen.getByRole('button', { name: /Confirm refund/ });
  await waitFor(() => expect(confirmRefund).toBeEnabled());
  fireEvent.click(confirmRefund);
  fireEvent.click(screen.getByRole('button', { name: 'Issue refund' }));

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledTimes(1));
  const [url, body] = apiMocks.post.mock.calls[0] as [string, Record<string, unknown>];
  expect(url).toBe(`/api/v1/admin/bookings/${bookingId}/escrow/refund`);
  expect(body).toMatchObject({
    amount: 12550,
    reason: 'Support verified the incomplete portion of the work.',
    supportTicketId,
    idempotencyKey,
  });
});
