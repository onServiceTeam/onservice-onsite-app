import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { BookingActions } from '../BookingDetailPage';

it('Bug UX-467 — a consequential booking action explains its impact in-app before sending the mutation', async () => {
  apiMocks.post.mockResolvedValue({ data: { success: true } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['admin-booking-money', 'booking-1'], { paymentIntents: [] });
  render(<QueryClientProvider client={client}><BookingActions bookingId="booking-1" /></QueryClientProvider>);

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Booking action reason' }), {
    target: { value: 'Customer requested cancellation after support review.' },
  });
  fireEvent.change(screen.getByLabelText('Hours until scheduled (required)'), {
    target: { value: '24' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancel' }));

  expect(apiMocks.post).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByText(/inputs above directly control the live refund calculation/i)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/api/v1/admin/bookings/booking-1/cancel', {
    reason: 'Customer requested cancellation after support review.',
    hoursUntilScheduled: 24,
    providerArrived: undefined,
    customerNoShow: undefined,
  }));
  await waitFor(() => expect(client.getQueryState(['admin-booking-money', 'booking-1'])?.isInvalidated).toBe(true));
});
