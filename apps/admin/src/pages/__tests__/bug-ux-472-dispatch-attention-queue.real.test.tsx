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

it('Bug UX-472 — dispatch derives visible attention items from loaded booking facts instead of claiming an unsupported alert feed', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.includes('/admin/bookings')) return { data: { data: [{
      id: 'booking-needs-review', status: 'paid', customerId: 'customer-1', customerName: 'Ana Reyes',
      providerId: null, providerName: null, categoryName: 'Cleaning', city: 'Cebu City',
      totalAmount: 125000, latitude: null, longitude: null, scheduledAt: '2020-01-01T01:00:00.000Z',
    }] } };
    return { data: { data: [] } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><DispatchConsolePage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Provider not assigned')).toBeVisible();
  expect(screen.getByText('Dispatch Attention')).toBeVisible();
  expect(screen.getByText('Scheduled time has passed')).toBeVisible();
  expect(screen.getByText('Service coordinates missing')).toBeVisible();
  expect(screen.queryByText(/live alert/i)).not.toBeInTheDocument();
});
