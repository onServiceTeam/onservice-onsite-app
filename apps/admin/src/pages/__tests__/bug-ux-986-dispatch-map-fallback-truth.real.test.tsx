import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: ({ url }: { url?: string }) => <div data-testid="tile-layer" data-url={url} />,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useMap: () => ({}),
}));

import api from '@/lib/api';
import DispatchConsolePage from '../DispatchConsolePage';

it('Bug UX-986 — Dispatch identifies and retries a settings-outage map fallback', async () => {
  let settingsAttempts = 0;
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.includes('/admin/settings/dispatch')) {
      settingsAttempts += 1;
      if (settingsAttempts === 1) return Promise.reject(new Error('Settings unavailable'));
      return Promise.resolve({
        data: {
          data: [
            { key: 'map_tile_url', value: 'https://tiles.example.test/{z}/{x}/{y}.png' },
            { key: 'map_tile_api_key', value: '' },
            { key: 'map_tile_attribution', value: 'Example tiles' },
          ],
        },
      } as never);
    }
    return Promise.resolve({ data: { data: [] } } as never);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DispatchConsolePage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/Dispatch is using the OpenStreetMap fallback/i)).toBeVisible();
  expect(screen.getByTestId('tile-layer')).toHaveAttribute(
    'data-url',
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  fireEvent.click(screen.getByRole('button', { name: 'Retry map settings' }));

  await waitFor(() => {
    expect(screen.queryByText(/Dispatch is using the OpenStreetMap fallback/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('tile-layer')).toHaveAttribute(
      'data-url',
      'https://tiles.example.test/{z}/{x}/{y}.png',
    );
  });
});
