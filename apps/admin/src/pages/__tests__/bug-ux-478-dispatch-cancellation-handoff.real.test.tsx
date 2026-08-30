import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

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

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import DispatchConsolePage from '../DispatchConsolePage';

it('Bug UX-478 — dispatch hands cancellation to Booking 360 instead of submitting default refund inputs', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.includes('/admin/bookings')) return { data: { data: [{
      id: 'booking-12345678', status: 'paid', customerId: 'customer-1', customerName: 'Ana Reyes',
      providerId: 'provider-1', providerName: 'Cebu Home Pro', categoryName: 'Cleaning', city: 'Cebu City',
      totalAmount: 125000, latitude: null, longitude: null, scheduledAt: '2026-08-31T01:00:00.000Z',
    }] } };
    return { data: { data: [] } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><DispatchConsolePage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByLabelText('Review cancellation for booking booking-12345678'))
    .toHaveAttribute('to', '/bookings/booking-12345678');
  expect(screen.queryByRole('button', { name: 'Cancel booking booking-12345678' })).not.toBeInTheDocument();
  expect(apiMocks.post).not.toHaveBeenCalled();
});
