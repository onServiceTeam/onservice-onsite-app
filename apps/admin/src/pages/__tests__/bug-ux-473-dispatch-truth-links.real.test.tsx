import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-leaflet', () => {
  const React2 = require('react') as typeof import('react');
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => React2.createElement('div', { 'data-map': 'container' }, children),
    TileLayer: () => React2.createElement('div', { 'data-map': 'tiles' }),
    Marker: ({ position, children }: { position?: [number, number]; children?: React.ReactNode }) => (
      React2.createElement('div', { 'data-map': 'marker', 'data-position': JSON.stringify(position) }, children)
    ),
    Popup: ({ children }: { children?: React.ReactNode }) => React2.createElement('div', null, children),
    useMap: () => ({}),
  };
});

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: (error: Error) => error.message }));

import DispatchConsolePage from '../DispatchConsolePage';

it('Bug UX-473 — dispatch distinguishes service and provider-base locations and links every loaded booking party to support workspaces', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.includes('/admin/bookings')) return { data: { data: [{
      id: 'booking-12345678', status: 'provider_en_route', customerId: 'customer-1', customerName: 'Ana Reyes',
      providerId: 'provider-1', providerName: 'Cebu Home Pro', categoryName: 'Cleaning', city: 'Cebu City',
      totalAmount: 125000, latitude: 10.3157, longitude: 123.8854,
      scheduledAt: '2026-08-30T01:00:00.000Z',
    }] } };
    if (url.includes('/admin/providers')) return { data: { data: [{
      id: 'provider-1', businessName: 'Cebu Home Pro', city: 'Cebu City', latitude: 10.32, longitude: 123.89,
    }] } };
    if (url.includes('/admin/service-areas')) return { data: { data: [{
      centerLat: 10.3157, centerLng: 123.8854, isDefault: true, status: 'active',
    }] } };
    if (url.includes('/admin/settings/dispatch')) return { data: { data: [] } };
    return { data: { data: [] } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}><MemoryRouter><DispatchConsolePage /></MemoryRouter></QueryClientProvider>,
  );

  expect(await screen.findByText('Accepting work, not live GPS')).toBeVisible();
  const positions = Array.from(container.querySelectorAll('[data-map="marker"]')).map((node) => node.getAttribute('data-position'));
  expect(positions).toContain(JSON.stringify([10.3157, 123.8854]));
  expect(positions).toContain(JSON.stringify([10.32, 123.89]));

  fireEvent.click(screen.getByLabelText('View booking booking-12345678'));
  expect(await screen.findByText('coordinates available')).toBeVisible();
  await waitFor(() => expect(screen.getByText('Booking 360')).toHaveAttribute('to', '/bookings/booking-12345678'));
  expect(screen.getByText('Customer 360')).toHaveAttribute('to', '/customers/customer-1');
  expect(screen.getByText('Provider 360')).toHaveAttribute('to', '/providers/provider-1');
  expect(screen.getByText('Conversation')).toHaveAttribute('to', '/communications?bookingId=booking-12345678');
  expect(screen.getByText('Support cases')).toHaveAttribute('to', '/support-tickets?bookingId=booking-12345678');
});
