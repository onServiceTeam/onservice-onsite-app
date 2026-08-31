import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

vi.mock('react-leaflet', () => {
  const React2 = require('react') as typeof import('react');
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => React2.createElement('div', null, children),
    TileLayer: () => React2.createElement('div'),
    Marker: ({ children }: { children?: React.ReactNode }) => React2.createElement('div', null, children),
    Popup: ({ children }: { children?: React.ReactNode }) => React2.createElement('div', null, children),
    useMap: () => ({}),
  };
});

import DispatchConsolePage from '../DispatchConsolePage';

it('Bug UX-718 — dispatch does not compare a filtered loaded count with the unfiltered server total', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.includes('/admin/bookings')) return { data: {
      data: [
        {
          id: 'booking-cebu', status: 'paid', customerId: 'customer-1', customerName: 'Maria Santos',
          providerId: 'provider-1', providerName: 'Cebu Pro', categoryName: 'Cleaning', city: 'Cebu City',
          totalAmount: 100000, latitude: 10.31, longitude: 123.89,
        },
        {
          id: 'booking-mandaue', status: 'paid', customerId: 'customer-2', customerName: 'Jose Reyes',
          providerId: 'provider-2', providerName: 'Mandaue Pro', categoryName: 'Plumbing', city: 'Mandaue',
          totalAmount: 120000, latitude: 10.34, longitude: 123.94,
        },
      ],
      pagination: { total: 250 },
    } } as never;
    if (url.includes('/admin/providers')) return { data: { data: [], pagination: { total: 0 } } } as never;
    return { data: { data: [] } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><DispatchConsolePage /></QueryClientProvider>);

  const bookingCounter = await screen.findByText(/loaded active bookings/i);
  await waitFor(() => expect(bookingCounter).toHaveTextContent('2 loaded active bookings of 250'));

  fireEvent.change(screen.getByLabelText('Filter by city'), { target: { value: 'Cebu City' } });

  await waitFor(() => {
    expect(bookingCounter).toHaveTextContent('1 loaded active bookings');
    expect(bookingCounter).not.toHaveTextContent('of 250');
  });
});
