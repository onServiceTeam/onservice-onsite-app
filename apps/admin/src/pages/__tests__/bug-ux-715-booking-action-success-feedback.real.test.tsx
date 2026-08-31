import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('sonner', () => ({ toast: toastMocks }));

import { BookingActions } from '../BookingDetailPage';

it('Bug UX-715 — a successful Booking 360 money action leaves explicit operator feedback', async () => {
  apiMocks.post.mockResolvedValueOnce({ data: { success: true } });
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

  fireEvent.click(screen.getByRole('button', { name: 'Manual release' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Booking action reason' }), {
    target: { value: 'Support verified completion and held escrow.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm release' }));
  fireEvent.click(screen.getByRole('button', { name: 'Release escrow' }));

  await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Escrow released.'));
});
