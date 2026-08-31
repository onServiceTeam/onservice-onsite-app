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

it('Bug UX-716 — dispatch discloses its capped map feed and searches the full provider directory for reassignment', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.includes('/admin/bookings')) return { data: { data: [{
      id: 'booking-1', status: 'paid', customerId: 'customer-1', customerName: 'Maria Santos',
      providerId: 'provider-current', providerName: 'Current Pro', categoryName: 'Cleaning', city: 'Cebu City',
      totalAmount: 100000, latitude: 10.31, longitude: 123.89, scheduledAt: '2026-09-01T01:00:00.000Z',
    }], pagination: { total: 1 } } } as never;
    if (url.includes('/admin/providers') && url.includes('search=Far')) return { data: {
      data: [{ id: 'provider-far', businessName: 'Far Directory Pro', city: 'Mandaue', latitude: 10.34, longitude: 123.94 }],
      pagination: { total: 1 },
    } } as never;
    if (url.includes('/admin/providers')) return { data: {
      data: [{ id: 'provider-current', businessName: 'Current Pro', city: 'Cebu City', latitude: 10.31, longitude: 123.89 }],
      pagination: { total: 250 },
    } } as never;
    return { data: { data: [] } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><DispatchConsolePage /></QueryClientProvider>);

  expect(await screen.findByText(/map shows the first 1 of 250 providers accepting work/i)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Reassign booking booking-1' }));
  fireEvent.change(screen.getByLabelText('Search providers'), { target: { value: 'Far' } });

  expect(await screen.findByRole('option', { name: 'Far Directory Pro — Mandaue' })).toBeVisible();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('search=Far')));
});
