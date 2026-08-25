import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/address.service', () => ({
  getAddresses: jest.fn().mockResolvedValue([{
    id: 'address-1', userId: 'customer-1', label: 'Home', fullAddress: '12 Mango Street', barangay: 'Banilad',
    city: 'Mandaue City', province: 'Cebu', notes: null, isDefault: false, latitude: 10.3, longitude: 123.9,
    createdAt: '2026-08-25', updatedAt: '2026-08-25',
  }]),
  createAddress: jest.fn(), updateAddress: jest.fn().mockResolvedValue({}), deleteAddress: jest.fn(),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ isAvailable: true, isLoading: false, getCurrentLocation: jest.fn() }),
}));
jest.mock('@/services/service-area.service', () => ({ checkCoverage: jest.fn() }));

import AddressesScreen from '../app/customer/addresses';

it('Bug UX-397 — saved-address row actions, label choices, and default setting expose their purpose and state', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AddressesScreen /></QueryClientProvider>);

  expect(await screen.findByRole('button', { name: 'Set Home as default address' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Edit Home address' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Delete Home address' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Edit Home address' }));
  expect(screen.getByRole('button', { name: 'Use Home address label' }).getAttribute('aria-selected')).toBe('true');
  const defaultAddress = screen.getByRole('checkbox', { name: 'Set as default address' });
  expect(defaultAddress.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(defaultAddress);
  expect(defaultAddress.getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('button', { name: 'Cancel address form' })).toBeTruthy();
});
