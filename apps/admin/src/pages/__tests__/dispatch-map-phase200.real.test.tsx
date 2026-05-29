// Phase 200 — dispatch map data + admin-configurable tiles.
//
// Proves the real wiring end-to-end in jsdom:
//   1. Bookings + online providers that carry lat/lng render as map markers.
//   2. The tile layer uses the admin-configured tile URL from
//      /admin/settings/dispatch, with the {apiKey} placeholder substituted.
//
// react-leaflet is locally mocked here (overriding vitest.setup) so the
// stub exposes `url`/`position` as data attributes we can assert on.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Local react-leaflet mock that surfaces props we want to assert.
vi.mock('react-leaflet', () => {
  const React2 = require('react') as typeof import('react');
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) =>
      React2.createElement('div', { 'data-leaflet': 'MapContainer' }, children),
    TileLayer: ({ url, attribution }: { url?: string; attribution?: string }) =>
      React2.createElement('div', { 'data-leaflet': 'TileLayer', 'data-url': url, 'data-attr': attribution }),
    Marker: ({ position, children }: { position?: [number, number]; children?: React.ReactNode }) =>
      React2.createElement('div', { 'data-leaflet': 'Marker', 'data-pos': JSON.stringify(position) }, children),
    Popup: ({ children }: { children?: React.ReactNode }) =>
      React2.createElement('div', { 'data-leaflet': 'Popup' }, children),
    useMap: () => ({}),
  };
});

import api from '@/lib/api';
import DispatchConsolePage from '../DispatchConsolePage';

const BOOKINGS = [
  { id: 'bk1', status: 'paid', customerId: 'c1', customerName: 'Jane C', providerId: 'p1',
    providerName: 'Acme', categoryName: 'Cleaning', city: 'Boracay', totalAmount: 150000,
    latitude: 11.969, longitude: 121.927, scheduledAt: null, etaMinutes: null },
];
const PROVIDERS = [
  { id: 'p1', businessName: 'Acme Cleaning', latitude: 11.97, longitude: 121.93, city: 'Boracay' },
];
const DISPATCH_SETTINGS = [
  { key: 'map_tile_url', value: 'https://tiles.example.com/{z}/{x}/{y}.png?key={apiKey}' },
  { key: 'map_tile_api_key', value: 'TESTKEY123' },
  { key: 'map_tile_attribution', value: 'Test Tiles Attribution' },
];

beforeEach(() => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.includes('/admin/bookings')) return Promise.resolve({ data: { data: BOOKINGS } } as never);
    if (url.includes('/admin/providers')) return Promise.resolve({ data: { data: PROVIDERS } } as never);
    if (url.includes('/admin/settings/dispatch')) return Promise.resolve({ data: { data: DISPATCH_SETTINGS } } as never);
    return Promise.resolve({ data: { data: [] } } as never);
  });
});

function renderPage(): HTMLElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(MemoryRouter, { initialEntries: ['/'] }, React.createElement(DispatchConsolePage)),
    ),
  );
  return container;
}

describe('Phase 200 — dispatch map renders coordinates + configurable tiles', () => {
  it('renders a marker for a booking that has lat/lng', async () => {
    const container = renderPage();
    await waitFor(() => {
      const markers = container.querySelectorAll('[data-leaflet="Marker"]');
      const positions = Array.from(markers).map((m) => m.getAttribute('data-pos'));
      expect(positions).toContain(JSON.stringify([11.969, 121.927]));
    });
  });

  it('renders a marker for an online provider that has lat/lng', async () => {
    const container = renderPage();
    await waitFor(() => {
      const positions = Array.from(container.querySelectorAll('[data-leaflet="Marker"]'))
        .map((m) => m.getAttribute('data-pos'));
      expect(positions).toContain(JSON.stringify([11.97, 121.93]));
    });
  });

  it('applies the admin-configured tile URL with the API key substituted', async () => {
    const container = renderPage();
    await waitFor(() => {
      const tile = container.querySelector('[data-leaflet="TileLayer"]');
      expect(tile?.getAttribute('data-url')).toBe('https://tiles.example.com/{z}/{x}/{y}.png?key=TESTKEY123');
      expect(tile?.getAttribute('data-attr')).toBe('Test Tiles Attribution');
    });
  });
});
