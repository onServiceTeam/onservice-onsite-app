import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/address.service', () => ({
  getAddresses: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ isAvailable: false, isLoading: false, getCurrentLocation: jest.fn() }),
}));

jest.mock('@/hooks/useServiceAreaDefaults', () => ({
  useServiceAreaDefaults: () => ({
    areas: [
      { id: 'cebu', name: 'Cebu City', city: 'Cebu City', province: 'Cebu', centerLat: 10.3157, centerLng: 123.8854 },
      { id: 'mandaue', name: 'Mandaue', city: 'Mandaue', province: 'Cebu', centerLat: 10.3236, centerLng: 123.9223 },
    ],
    defaultRegion: { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.05, longitudeDelta: 0.05 },
    isLoading: false,
  }),
}));

jest.mock('@/services/service-area.service', () => ({
  checkCoverage: jest.fn(),
}));

import AddressPickerScreen from '../app/customer/address-picker';

it('Bug UX-051 — city search does not treat an area center as an exact service pin', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <AddressPickerScreen />
    </QueryClientProvider>,
  );

  fireEvent.input(screen.getByLabelText('Service address'), {
    target: { value: 'A.S. Fortuna St, Mandaue City, Cebu' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search active service areas' }));

  await waitFor(() => expect(screen.getByText('Mandaue, Cebu')).toBeTruthy());
  const result = screen.getByText('Mandaue, Cebu').closest('button');
  expect(result).not.toBeNull();
  fireEvent.click(result!);

  expect(screen.getByRole('alert').textContent).toContain('exact service address');
  expect((screen.getByRole('button', { name: 'Confirm Address' }) as HTMLButtonElement).disabled).toBe(true);
});
