import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('sonner', () => ({ toast: toastMocks }));

import { BookingActions } from '../BookingDetailPage';

it('Bug OPS-288 — Booking 360 tells the operator when payment processing was queued', async () => {
  const supportTicketId = '22222222-2222-4222-8222-222222222222';
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => '33333333-3333-4333-8333-333333333333',
  });
  apiMocks.get.mockResolvedValue({
    data: { data: [{ id: supportTicketId, ticket_number: 'SUP-288', subject: 'Refund review' }] },
  });
  apiMocks.post.mockResolvedValue({
    data: {
      success: true,
      data: {
        customerWalletCredited: false,
        idempotentReplay: false,
        paymentProcessingQueued: true,
        paymentProcessingStatus: 'queued',
      },
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BookingActions
        bookingId="11111111-1111-4111-8111-111111111111"
        bookingStatus="confirmed"
        escrowStatus="held"
      />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
  await screen.findByRole('option', { name: 'SUP-288 · Refund review' });
  fireEvent.change(screen.getByLabelText('Refund amount (PHP)'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Active linked support case (required)'), {
    target: { value: supportTicketId },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Booking action reason' }), {
    target: { value: 'Support approved a partial service refund.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Confirm refund/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Issue refund' }));

  await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(
    'Refund recorded. Payment processing was queued for retry.',
  ));
});
