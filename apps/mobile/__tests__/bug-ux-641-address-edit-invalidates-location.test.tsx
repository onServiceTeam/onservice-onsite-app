import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpdateAddress = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/address.service', () => ({
  getAddresses: jest.fn().mockResolvedValue([{
    id: 'address-1', userId: 'customer-1', label: 'Home', fullAddress: '12 Mango Street', barangay: 'Banilad',
    city: 'Mandaue City', province: 'Cebu', notes: null, isDefault: true, latitude: 10.3, longitude: 123.9,
    createdAt: '2026-08-25', updatedAt: '2026-08-25',
  }]),
  createAddress: jest.fn(),
  updateAddress: (...args: unknown[]) => mockUpdateAddress(...args),
  deleteAddress: jest.fn(),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ isAvailable: true, isLoading: false, getCurrentLocation: jest.fn() }),
}));
jest.mock('@/services/service-area.service', () => ({ checkCoverage: jest.fn() }));

import AddressesScreen from '../app/customer/addresses';

it('Bug UX-641 — editing a verified address invalidates stale coordinates until the service location is verified again', async () => {
  mockUpdateAddress.mockResolvedValue({});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AddressesScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Edit Home address' }));
  expect(screen.getByText('Exact service location is saved.')).toBeTruthy();

  fireEvent.input(screen.getByLabelText('City or municipality'), { target: { value: 'Cebu City' } });
  expect(screen.getByText(/address details changed.*verify the exact service location again/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(mockUpdateAddress).toHaveBeenCalledWith('address-1', expect.objectContaining({
    city: 'Cebu City',
    latitude: undefined,
    longitude: undefined,
  })));
});
