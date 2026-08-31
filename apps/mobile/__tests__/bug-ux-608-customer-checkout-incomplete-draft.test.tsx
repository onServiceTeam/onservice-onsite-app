import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CheckoutScreen from '../app/customer/booking/checkout';
import { useBookingStore } from '../src/stores/booking.store';

describe('Bug UX-608 — customer checkout rejects an incomplete booking draft', () => {
  it('shows recovery without exposing payment choices or creating a false summary', () => {
    useBookingStore.getState().reset();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <CheckoutScreen />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Booking details are incomplete')).toBeTruthy();
    expect(screen.getByText('Browse services')).toBeTruthy();
    expect(screen.queryByText('Choose Payment Method')).toBeNull();
  });
});
