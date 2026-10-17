import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConfigureScreen from '../app/customer/booking/configure';
import { useBookingStore } from '../src/stores/booking.store';

// D41 Q39 (Ken, 2026-10-18): this old fixed-price screen is used only while
// request-first booking is off; with it on, the screen sends the customer to
// the request form. This test pins the screen in the switched-off state.
jest.mock('@/hooks/useRequestFirstBooking', () => ({
  useRequestFirstBooking: () => false,
  useRequestFirstBookingState: () => ({ requestFirst: false, settled: true }),
}));

describe('Bug UX-606 — customer configure rejects a missing service selection', () => {
  it('renders a recovery action instead of a usable-looking zero-price configuration', () => {
    useBookingStore.getState().reset();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <ConfigureScreen />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Choose a service first')).toBeTruthy();
    expect(screen.getByText('Browse services')).toBeTruthy();
    expect(screen.queryByText('Estimated Total')).toBeNull();
  });
});
