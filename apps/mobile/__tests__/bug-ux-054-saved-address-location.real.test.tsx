import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateAddress = jest.fn();
jest.mock('@/services/address.service', () => ({
  getAddresses: jest.fn().mockResolvedValue([]),
  createAddress: (...args: unknown[]) => mockCreateAddress(...args),
  updateAddress: jest.fn(),
  deleteAddress: jest.fn(),
}));

jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({
    isAvailable: true,
    isLoading: false,
    getCurrentLocation: jest.fn().mockResolvedValue({ latitude: 10.3236, longitude: 123.9223 }),
  }),
}));

jest.mock('@/services/service-area.service', () => ({
  checkCoverage: jest.fn().mockResolvedValue({
    covered: true,
    area: { id: 'mandaue', name: 'Mandaue', city: 'Mandaue', province: 'Cebu' },
    nearestArea: null,
  }),
}));

import AddressesScreen from '../app/customer/addresses';

it('Bug UX-054 — a saved address can capture verified coordinates and sends them with canonical service-area city data', async () => {
  mockCreateAddress.mockResolvedValue({ id: 'address-1' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <AddressesScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByRole('button', { name: 'Add Your First Address' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Add Your First Address' }));
  fireEvent.input(screen.getByLabelText('Full address'), { target: { value: 'A.S. Fortuna Street' } });
  fireEvent.input(screen.getByLabelText('Barangay'), { target: { value: 'Banilad' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use current location for saved address' }));

  await waitFor(() => expect(screen.getByDisplayValue('Mandaue')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Add Address' }));

  await waitFor(() => expect(mockCreateAddress).toHaveBeenCalledWith(expect.objectContaining({
    fullAddress: 'A.S. Fortuna Street',
    barangay: 'Banilad',
    city: 'Mandaue',
    province: 'Cebu',
    latitude: 10.3236,
    longitude: 123.9223,
  })));
});
