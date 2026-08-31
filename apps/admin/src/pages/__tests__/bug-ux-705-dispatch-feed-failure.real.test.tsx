import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

it('Bug UX-705 — a failed dispatch booking feed blocks false zero and empty-state decisions with a local retry', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.includes('/admin/bookings')) throw new Error('Dispatch booking feed unavailable');
    return { data: { data: [] } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><DispatchConsolePage /></QueryClientProvider>);

  expect(await screen.findByRole('button', { name: 'Retry active bookings' })).toBeTruthy();
  expect(screen.getByText(/Active bookings are unavailable/)).toBeTruthy();
  expect(screen.getByText(/Dispatch attention cannot be derived/)).toBeTruthy();
  expect(screen.queryByText('No active bookings.')).toBeNull();
  expect(screen.queryByText('No loaded booking currently needs dispatch attention.')).toBeNull();
});
