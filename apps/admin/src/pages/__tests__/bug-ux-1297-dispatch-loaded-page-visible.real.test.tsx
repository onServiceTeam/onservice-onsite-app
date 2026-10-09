import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';

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

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import DispatchConsolePage from '../DispatchConsolePage';

function booking(index: number) {
  return {
    id: `booking-${index}`,
    status: 'paid',
    customerId: `customer-${index}`,
    customerName: `Customer ${index}`,
    providerId: null,
    providerName: null,
    categoryName: 'Cleaning',
    city: 'Cebu City',
    totalAmount: 100000,
    latitude: null,
    longitude: null,
    scheduledAt: '2026-09-01T01:00:00.000Z',
  };
}

beforeEach(() => {
  apiMocks.get.mockReset();
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.includes('/admin/bookings')) {
      return { data: { data: Array.from({ length: 51 }, (_, index) => booking(index + 1)), pagination: { total: 51 } } };
    }
    return { data: { data: [], pagination: { total: 0 } } };
  });
});

it('Bug UX-1297 - dispatch shows every booking in the loaded feed page instead of silently stopping at fifty', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><DispatchConsolePage /></QueryClientProvider>);

  expect(await screen.findByText('Showing 51 of 51')).toBeVisible();
  expect(screen.getByText('Customer 51')).toBeVisible();
});
