import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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

it('Bug UX-706 — dispatch reassignment excludes the current provider and explains the final server eligibility gate', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.includes('/admin/bookings')) return { data: { data: [{
      id: 'booking-1', status: 'paid', customerId: 'customer-1', customerName: 'Maria Santos',
      providerId: 'provider-1', providerName: 'Current Pro', categoryName: 'Cleaning', city: 'Cebu City',
      totalAmount: 100000, latitude: 10.31, longitude: 123.89, scheduledAt: '2026-09-01T01:00:00.000Z',
    }] } } as never;
    if (url.includes('/admin/providers')) return { data: { data: [
      { id: 'provider-1', businessName: 'Current Pro', city: 'Cebu City', latitude: 10.31, longitude: 123.89 },
      { id: 'provider-2', businessName: 'Replacement Pro', city: 'Cebu City', latitude: 10.32, longitude: 123.90 },
    ] } } as never;
    return { data: { data: [] } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><DispatchConsolePage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Reassign booking booking-1' }));
  expect(screen.queryByRole('option', { name: /Current Pro/ })).toBeNull();
  expect(screen.getByRole('option', { name: /Replacement Pro/ })).toBeTruthy();
  expect(screen.getByText(/server rechecks account approval/i)).toBeTruthy();
});
