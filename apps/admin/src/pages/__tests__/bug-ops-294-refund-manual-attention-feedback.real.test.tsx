import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('sonner', () => ({ toast: toastMocks }));

import { BookingActions } from '../BookingDetailPage';

it('Bug OPS-294 — Booking 360 flags a recorded refund that requires manual payment attention', async () => {
  const supportTicketId = '22222222-2222-4222-8222-222222222222';
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => '33333333-3333-4333-8333-333333333333',
  });
  apiMocks.get.mockResolvedValue({
    data: { data: [{ id: supportTicketId, ticket_number: 'SUP-294', subject: 'Refund reconciliation' }] },
  });
  apiMocks.post.mockResolvedValue({
    data: {
      success: true,
      data: {
        customerWalletCredited: false,
        idempotentReplay: true,
        paymentProcessingQueued: false,
        paymentProcessingStatus: 'manual_attention',
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
  await screen.findByRole('option', { name: 'SUP-294 · Refund reconciliation' });
  fireEvent.change(screen.getByLabelText('Refund amount (PHP)'), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('Active linked support case (required)'), {
    target: { value: supportTicketId },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Booking action reason' }), {
    target: { value: 'Support approved this refund after review.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Confirm refund/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Issue refund' }));

  await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(
    'Refund recorded, but payment processing requires manual attention. No second refund was issued.',
  ));
});
