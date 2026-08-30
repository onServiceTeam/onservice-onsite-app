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
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
    { getState: () => ({ user: { role: 'admin' } }) },
  ),
}));

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import DispatchConsolePage from '../DispatchConsolePage';

it('Bug UX-482 — the dispatch workspace gives a support admin messaging access without exposing super-admin booking controls', async () => {
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

  expect(await screen.findByRole('button', { name: 'Post support message for booking booking-12345678' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Reassign booking booking-12345678' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Review cancellation for booking booking-12345678')).not.toBeInTheDocument();
});
