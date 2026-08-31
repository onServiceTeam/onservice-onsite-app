import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConfigureScreen from '../app/customer/booking/configure';
import { useBookingStore } from '../src/stores/booking.store';

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
