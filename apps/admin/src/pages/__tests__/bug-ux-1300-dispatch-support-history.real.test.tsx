import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
    { getState: () => ({ user: { role: 'admin' } }) },
  ),
}));

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import DispatchConsolePage from '../DispatchConsolePage';

const bookingId = '13000000-0000-4000-8000-000000000001';

it('Bug UX-1300 - the dispatch support dialog exposes recent support activity and the canonical conversation link', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/v1/admin/bookings?status=active')) {
      return { data: { data: [{
        id: bookingId, status: 'paid', customerId: 'customer-1300', customerName: 'Ana Reyes',
        providerId: 'provider-1300', providerName: 'Cebu Home Pro', categoryName: 'Cleaning', city: 'Cebu City',
        totalAmount: 125000, latitude: null, longitude: null, scheduledAt: '2026-09-05T01:00:00.000Z',
      }], pagination: { total: 1 } } };
    }
    return { data: { data: [] } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><DispatchConsolePage /></MemoryRouter></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: `Post support message for booking ${bookingId}` }));

  expect(await screen.findByText('Review recent support activity')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Review conversation' })).toHaveAttribute(
    'href',
    `/communications?bookingId=${bookingId}`,
  );
});
