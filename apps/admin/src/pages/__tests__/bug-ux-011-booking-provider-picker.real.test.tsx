import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { BookingActions } from '../BookingDetailPage';

it('Bug UX-011 — reassigns a booking from named online providers instead of a UUID field', async () => {
  vi.mocked(api.get).mockResolvedValue({
    status: 200,
    ok: true,
    data: { data: [{ id: 'provider-1', businessName: 'Cebu Home Pro', city: 'Cebu City' }] },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <BookingActions bookingId="booking-1" />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Reassign' }));

  expect(await screen.findByRole('option', { name: 'Cebu Home Pro · Cebu City' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'New online provider' })).toBeTruthy();
  expect(screen.queryByText(/UUID/i)).toBeNull();
});
