import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-leaflet', () => {
  const React2 = require('react') as typeof import('react');
  return {
    MapContainer: ({ center, children }: { center?: [number, number]; children?: React.ReactNode }) => React2.createElement(
      'div',
      { 'data-map-center': JSON.stringify(center) },
      children,
    ),
    TileLayer: () => React2.createElement('div'),
    Marker: ({ children }: { children?: React.ReactNode }) => React2.createElement('div', null, children),
    Popup: ({ children }: { children?: React.ReactNode }) => React2.createElement('div', null, children),
    useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn() }),
  };
});

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: (error: Error) => error.message }));

import DispatchConsolePage from '../DispatchConsolePage';

it('BUG-PHASE97-01 — dispatch renders the configured default service-area center instead of a hardcoded Manila viewport', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.includes('/admin/service-areas')) {
      return { data: { data: [{
        centerLat: 7.0707,
        centerLng: 125.6087,
        isDefault: true,
        status: 'active',
      }] } };
    }
    return { data: { data: [] } };
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(React.createElement(
    QueryClientProvider,
    { client },
    React.createElement(MemoryRouter, null, React.createElement(DispatchConsolePage)),
  ));

  await waitFor(() => {
    expect(container.querySelector('[data-map-center]'))
      .toHaveAttribute('data-map-center', JSON.stringify([7.0707, 125.6087]));
  });
});
